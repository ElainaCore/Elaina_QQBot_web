import { useEffect, useState, type ReactNode } from "react";
import { Boxes, Download, ExternalLink, FileImage, FileText, MessageSquare, PackageOpen, RefreshCw, Reply, Search, Send, Trash2, X } from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api, type ApiData } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Busy, FeatureHeading, Notice, SelectBox, errorMessage } from "@/features/shared";
import { cn } from "@/lib/utils";

function LazyAvatar({ src, label, className }: { src: string; label: string; className?: string }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [src]);
  const sources = [src, src.includes("thirdqq.qlogo.cn") ? src.replace("thirdqq.qlogo.cn", "q1.qlogo.cn") : ""].filter((value, index, list) => value && list.indexOf(value) === index);
  const currentSource = sources[sourceIndex] || "";
  return <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground", className)}>
    {currentSource ? <img src={currentSource} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setSourceIndex((current) => current + 1)} /> : <span>{String(label || "?").charAt(0)}</span>}
  </div>;
}

function chatDisplayName(chat: ApiData) {
  return String(chat.nickname || chat.group_name || chat.groupName || chat.name || chat.peerName || chat.chat_id || "未知会话");
}

function messageSenderId(message: ApiData) {
  const direct = message.user_id || message.sender_qq || message.sender_id;
  if (direct) return String(direct);
  if (typeof message.raw_message === "string" && message.raw_message) {
    try {
      const raw = JSON.parse(message.raw_message) as ApiData;
      const sender = raw?.sender as ApiData | undefined;
      return String(raw?.user_id || sender?.user_id || "");
    } catch {
      return "";
    }
  }
  return "";
}

function mentionMap(message: ApiData): Record<string, string> {
  const value = message.mentions;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
}

function renderMentionText(value: string, names: Record<string, string>): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /@([0-9]{4,12}|all)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const target = match[1];
    const nickname = names[target] || (target === "all" ? "全体成员" : target);
    parts.push(<span key={match.index + "-" + target} className="rounded-sm bg-primary/10 px-0.5 font-medium text-primary">@{nickname}</span>);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts.length ? parts : value;
}

function messageSegments(message: ApiData): ApiData[] {
  if (Array.isArray(message.message_segments)) return message.message_segments;
  if (Array.isArray(message.message)) return message.message;
  if (typeof message.raw_message === "string") {
    try {
      const raw = JSON.parse(message.raw_message) as ApiData;
      return Array.isArray(raw.message) ? raw.message : [];
    } catch {
      return [];
    }
  }
  return [];
}

function messageMentionIds(message: ApiData): string[] {
  const ids = new Set<string>();
  for (const segment of messageSegments(message)) {
    if (String(segment.type || "") !== "at") continue;
    const data = segment.data && typeof segment.data === "object" ? segment.data as ApiData : {};
    const target = String(data.qq || data.user_id || data.target || "");
    if (/^\d{4,12}$/.test(target)) ids.add(target);
  }
  for (const match of String(message.content || "").matchAll(/@(\d{4,12})/g)) ids.add(match[1]);
  return [...ids];
}

function MessageContent({ message }: { message: ApiData }) {
  if (message.recalled) return <span>[消息已撤回]</span>;
  const names = mentionMap(message);
  const segments = messageSegments(message);
  if (!segments.length) return <>{renderMentionText(String(message.content || "[空消息]"), names)}</>;
  return <>{segments.map((segment, index) => {
    const type = String(segment.type || "");
    const data = segment.data && typeof segment.data === "object" ? segment.data as ApiData : {};
    if (type === "text") return <span key={index}>{renderMentionText(String(data.text || ""), names)}</span>;
    if (type === "at") {
      const target = String(data.qq || data.user_id || data.target || "");
      const nickname = String(data.name || names[target] || (target === "all" ? "全体成员" : target || "未知"));
      return <span key={index} className="rounded-sm bg-primary/10 px-0.5 font-medium text-primary">@{nickname}</span>;
    }
    const labels: Record<string, string> = { image: "[图片]", record: "[语音]", video: "[视频]", file: "[文件]", face: "[表情]", forward: "[合并转发]", reply: "[回复]" };
    return <span key={index}>{labels[type] || (type ? "[" + type + "]" : "")}</span>;
  })}</>;
}

function rawMessageText(message: ApiData): string {
  const raw = message.raw_message;
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const { raw_pb: _rawPb, ...event } = parsed as ApiData;
        return JSON.stringify(event, null, 2);
      }
      return JSON.stringify(parsed, null, 2);
    } catch { return raw; }
  }
  return JSON.stringify(raw ?? message, null, 2);
}

function rawPbInfo(message: ApiData): ApiData | null {
  let value = message.raw_pb;
  if (!value && typeof message.raw_message === "string" && message.raw_message) {
    try {
      const parsed = JSON.parse(message.raw_message) as ApiData;
      value = parsed?.raw_pb;
    } catch {
      value = null;
    }
  }
  if (typeof value === "string" && value) {
    return { format: "protobuf", encoding: "hex", byte_length: Math.ceil(value.length / 2), data: value };
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as ApiData : null;
}

function rawPbText(pb: ApiData): string {
  const value = String(pb.data || "");
  if (String(pb.encoding || "").toLowerCase() !== "hex") return value;
  return (value.replace(/\s+/g, "").match(/.{1,64}/g) || []).join("\n");
}

function quotedMessageSummary(message: ApiData): string {
  const text = String(message.content || message.raw_content || "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 90 ? text.slice(0, 90) + "…" : text;
  const types = messageSegments(message).map((segment) => String(segment.type || "")).filter((type) => type && type !== "reply");
  const labels: Record<string, string> = { image: "[图片]", record: "[语音]", video: "[视频]", file: "[文件]" };
  return types.length ? types.map((type) => labels[type] || "[" + type + "]").join(" ") : "[消息]";
}

export function MessagesPage() {
  const dialog = useAppDialog();
  const [bot, setBot] = useState("");
  const [chatType, setChatType] = useState<"group" | "user">("group");
  const [search, setSearch] = useState("");
  const [chats, setChats] = useState<ApiData[]>([]);
  const [selected, setSelected] = useState<ApiData | null>(null);
  const [history, setHistory] = useState<ApiData[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [messageType, setMessageType] = useState<"text" | "media">("text");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [recallStatus, setRecallStatus] = useState<Record<string, string>>({});
  const [rawMessage, setRawMessage] = useState<ApiData | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<ApiData | null>(null);

  const avatarUrl = (chat: ApiData) => {
    const id = String(chat.chat_id || "");
    if (!id) return "";
    return chatType === "group"
      ? `https://p.qlogo.cn/gh/${id}/${id}/100/`
      : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=100`;
  };

  const loadChats = async () => {
    setLoading(true);
    try {
      const data = await api<ApiData>("/api/message/chats", {
        method: "POST",
        body: JSON.stringify({ bot_qq: bot, type: chatType, search, page: 1, page_size: 1000 }),
      });
      setChats(Array.isArray(data.data?.chats) ? data.data.chats : []);
    } catch (error) { setNotice(errorMessage(error, "读取会话失败")); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setSelected(null);
    setHistory([]);
    setRecallStatus({});
    setQuotedMessage(null);
    loadChats();
  }, [chatType]);

  const openChat = async (chat: ApiData) => {
    const changesChat = String(selected?.chat_id || "") !== String(chat.chat_id || "") || String(selected?.bot_qq || "") !== String(chat.bot_qq || "");
    setSelected(chat);
    setRecallStatus({});
    if (changesChat) setQuotedMessage(null);
    try {
      const data = await api<ApiData>("/api/message/history", {
        method: "POST",
        body: JSON.stringify({ bot_qq: bot || chat.bot_qq, chat_type: chatType, chat_id: chat.chat_id, count: 50 }),
      });
      const messages = Array.isArray(data.data?.messages) ? data.data.messages : [];
      const mentionIds = [...new Set(messages.flatMap(messageMentionIds))];
      if (!mentionIds.length) {
        setHistory(messages);
        return;
      }
      try {
        const nicknameData = await api<ApiData>("/api/message/nicknames", {
          method: "POST",
          body: JSON.stringify({ user_ids: mentionIds, bot_qq: bot || chat.bot_qq }),
        });
        const fallbackNames = nicknameData.data?.nicknames && typeof nicknameData.data.nicknames === "object" ? nicknameData.data.nicknames : {};
        setHistory(messages.map((message: ApiData) => ({ ...message, mentions: { ...fallbackNames, ...mentionMap(message) } })));
      } catch {
        setHistory(messages);
      }
    } catch (error) { setNotice(errorMessage(error, "读取历史失败")); }
  };

  const send = async () => {
    if (sending || !selected || (!draft.trim() && !image)) return;
    const sentText = draft.trim();
    const sentImage = image;
    const sentQuotedMessage = quotedMessage;
    const form = new FormData();
    form.append("bot_qq", bot || String(selected.bot_qq || ""));
    form.append("chat_type", chatType);
    form.append("chat_id", String(selected.chat_id));
    form.append("msg_type", messageType);
    form.append("content", sentText);
    if (sentQuotedMessage?.message_id) form.append("reply_message_id", String(sentQuotedMessage.message_id));
    if (sentQuotedMessage?.message_seq) form.append("reply_message_seq", String(sentQuotedMessage.message_seq));
    if (sentImage) form.append("image", sentImage);
    setSending(true);
    try {
      const request = api("/api/message/send", { method: "POST", body: form }).then(
        () => ({ state: "success" as const }),
        (error: unknown) => ({ state: "error" as const, error }),
      );
      let timeoutId = 0;
      const result = await Promise.race([
        request,
        new Promise<{ state: "pending" }>((resolve) => { timeoutId = window.setTimeout(() => resolve({ state: "pending" }), 8000); }),
      ]);
      window.clearTimeout(timeoutId);
      const clearSentDraft = () => {
        setDraft((current) => current.trim() === sentText ? "" : current);
        setImage((current) => current === sentImage ? null : current);
        setQuotedMessage((current) => String(current?.message_id || "") === String(sentQuotedMessage?.message_id || "") ? null : current);
      };
      if (result.state === "error") throw result.error;
      clearSentDraft();
      if (result.state === "success") {
        setNotice("消息发送成功");
        void openChat(selected);
      } else {
        setNotice("消息已提交，发送结果正在同步");
        void request.then((lateResult) => {
          if (lateResult.state === "success") {
            setNotice("消息发送成功");
            void openChat(selected);
          } else {
            setNotice(errorMessage(lateResult.error, "发送结果确认失败"));
          }
        });
      }
    } catch (error) { setNotice(errorMessage(error, "发送失败")); }
    finally { setSending(false); }
  };

  const recall = async (message: ApiData) => {
    const messageId = message.message_id;
    if (!messageId || !await dialog.confirm({ title: "撤回消息", description: "确认撤回这条消息吗？", confirmLabel: "撤回", destructive: true })) return;
    const recallKey = String(messageId);
    setRecallStatus((current) => ({ ...current, [recallKey]: "撤回中…" }));
    try {
      await api("/api/message/recall", { method: "POST", body: JSON.stringify({ message_id: messageId, bot_qq: bot || selected?.bot_qq }) });
      setHistory((current) => current.map((item) => String(item.message_id || item.id) === recallKey ? { ...item, recalled: true } : item));
      setRecallStatus((current) => ({ ...current, [recallKey]: "已撤回" }));
    } catch (error) {
      setRecallStatus((current) => ({ ...current, [recallKey]: "撤回失败：" + errorMessage(error, "请求失败") }));
    }
  };

  const editRemark = async () => {
    if (!selected) return;
    const remark = await dialog.prompt({ title: "群备注", description: "设置该群在面板中的备注名称，留空可清除备注。", defaultValue: String(selected.remark || selected.nickname || ""), confirmLabel: "保存", allowEmpty: true });
    if (remark === null) return;
    try {
      await api("/api/message/remarks", { method: "POST", body: JSON.stringify({ group_id: selected.chat_id, remark, qq: selected.group_qq || "" }) });
      setNotice("群备注已保存"); await loadChats();
    } catch (error) { setNotice(errorMessage(error, "备注保存失败")); }
  };

  const selectedId = selected ? String(selected.chat_id || "") : "";
  return <section className="space-y-4">
    <FeatureHeading icon={MessageSquare} title="消息" detail="好友与群列表、历史消息和消息发送" />
    {notice && <Notice text={notice} error={notice.includes("失败")} />}
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b p-2.5 sm:p-3">
          <Input className="w-full sm:w-[180px]" value={bot} onChange={(event) => setBot(event.target.value)} placeholder="机器人 QQ（可选）" />
          <div className="flex shrink-0 rounded-md border bg-muted/30 p-0.5">
            <Button variant={chatType === "group" ? "default" : "ghost"} size="sm" onClick={() => setChatType("group")}>群消息</Button>
            <Button variant={chatType === "user" ? "default" : "ghost"} size="sm" onClick={() => setChatType("user")}>好友消息</Button>
          </div>
          <Input className="w-full min-w-0 sm:flex-1" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={chatType === "group" ? "搜索群名称或群号" : "搜索好友昵称或 QQ"} onKeyDown={(event) => { if (event.key === "Enter") loadChats(); }} />
          <Button size="sm" variant="outline" onClick={loadChats}><Search className="size-3.5" />查询</Button>
          <Button size="icon" variant="ghost" onClick={loadChats} title="刷新联系人"><RefreshCw className="size-4" /></Button>
        </div>
        <div className="grid min-h-0 md:min-h-[640px] md:grid-cols-[clamp(190px,28vw,230px)_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="min-w-0 border-b md:border-b-0 md:border-r">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div><p className="text-sm font-semibold">{chatType === "group" ? "群列表" : "好友列表"}</p><p className="text-xs text-muted-foreground">共 {chats.length} 个</p></div>
              <Badge variant="secondary">全部</Badge>
            </div>
            <div className="max-h-[42dvh] space-y-1 overflow-y-auto overscroll-contain p-2 md:max-h-[590px]">
              {loading ? <Busy /> : chats.length ? chats.map((chat, index) => {
                const active = selectedId === String(chat.chat_id || "") && String(selected?.bot_qq || "") === String(chat.bot_qq || "");
                return <button key={String(chat.bot_qq || "") + "-" + String(chat.chat_id || index)} type="button" onClick={() => openChat(chat)} className={cn("flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-muted/70", active && "bg-primary/10 text-primary")}>
                  <LazyAvatar src={avatarUrl(chat)} label={chatDisplayName(chat)} className="size-9" />
                  <div className="min-w-0 flex-1"><div className="flex items-baseline gap-1.5"><p className="min-w-0 truncate text-sm font-medium">{chatDisplayName(chat)}</p><span className="shrink-0 text-[10px] text-muted-foreground">{chat.chat_id}</span></div><div className="mt-0.5 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{chat.last_content || "暂无消息"}</p><span className="shrink-0 text-[10px] text-muted-foreground">{String(chat.last_time || "").slice(11, 16)}</span></div></div>
                </button>;
              }) : <Notice text={chatType === "group" ? "暂无群列表" : "暂无好友列表"} />}
            </div>
          </aside>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
              <div className="min-w-0 flex-1"><p className="break-words font-semibold">{selected ? chatDisplayName(selected) : "请选择会话"}</p><p className="break-words text-xs text-muted-foreground">{selected ? (chatType === "group" ? "群号：" : "QQ：") + selected.chat_id + " · 接入账号：" + (selected.bot_qq || bot || "自动选择") : "从列表选择好友或群后即可查看和发送消息"}</p></div>
              {selected && chatType === "group" && <Button className="w-full min-[380px]:w-auto" size="sm" variant="outline" onClick={editRemark}>群备注</Button>}
            </div>
            <div className="min-h-[300px] flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-2.5 sm:min-h-[360px] sm:p-4 md:max-h-[470px]">
              {selected && history.length ? history.map((message, index) => {
                const id = message.message_id || message.id;
                const recallable = Boolean(message.message_id);
                const outgoing = Boolean(message.is_self);
                const senderId = outgoing ? String(message.bot_qq || selected?.bot_qq || bot || "") : messageSenderId(message);
                const rowStatus = recallStatus[String(id || "")];
                const avatar = senderId ? "https://thirdqq.qlogo.cn/g?b=qq&nk=" + encodeURIComponent(senderId) + "&s=100" : "";
                return <div key={String(id || index)} className={cn("group flex min-w-0 items-start gap-1.5 sm:gap-2", outgoing && "flex-row-reverse")}>
                  <LazyAvatar src={avatar} label={outgoing ? "我" : String(message.nickname || senderId || "?")} className="mt-1 size-8 border bg-background" />
                  <div className="flex min-w-0 max-w-[calc(100%-2.25rem)] flex-1 items-end gap-1 sm:max-w-[88%] sm:flex-initial sm:gap-1.5">
                  <div className={cn("min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm shadow-sm", outgoing ? "border-primary/20 bg-primary/10" : "bg-background")}>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span className="min-w-0 break-words">{outgoing ? "我（QQ " + senderId + "）" : message.nickname && senderId ? message.nickname + "（QQ " + senderId + "）" : message.nickname || "QQ " + (senderId || "未知")}</span><span className="shrink-0">{message.timestamp || ""}</span></div>
                    <p className="mt-1 whitespace-pre-wrap break-words"><MessageContent message={message} /></p>
                  </div>
                    <div className="flex w-[4.5rem] shrink-0 flex-col items-start gap-1 sm:w-auto">
                      <button type="button" aria-label="引用此消息" title={message.message_id ? "引用此消息" : "该消息没有可用的消息 ID"} disabled={!message.message_id || message.recalled} onClick={() => setQuotedMessage(message)} className="inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary disabled:cursor-not-allowed disabled:opacity-40"><Reply className="size-3" />引用</button>
                      {recallable && !message.recalled && <button type="button" aria-label="撤回此消息" disabled={rowStatus === "撤回中…"} onClick={() => recall(message)} className="px-1 text-[11px] text-muted-foreground transition-colors hover:text-destructive focus-visible:text-destructive disabled:cursor-wait disabled:opacity-60">{rowStatus?.startsWith("撤回失败") ? "重试" : "撤回"}</button>}
                      <button type="button" aria-label="查看原始内容" onClick={() => setRawMessage(message)} className="px-1 text-[11px] text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary">原始内容</button>
                      {rowStatus && <span className={cn("max-w-24 break-words px-1 text-[11px] sm:max-w-[160px]", rowStatus.startsWith("撤回失败") ? "text-destructive" : "text-muted-foreground")}>{rowStatus}</span>}
                    </div>
                  </div>
                </div>;
              }) : <div className="grid h-full min-h-[320px] place-items-center"><Notice text={selected ? "暂无历史消息，可以直接发送新消息" : "选择一个好友或群开始查看消息"} /></div>}
            </div>
            <div className="space-y-2 border-t bg-background p-3">
              {quotedMessage && <div className="flex min-w-0 items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <Reply className="size-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p className="truncate font-medium text-primary">引用 {quotedMessage.is_self ? "我" : String(quotedMessage.nickname || messageSenderId(quotedMessage) || "该成员")}</p><p className="truncate text-muted-foreground">{quotedMessageSummary(quotedMessage)}</p></div>
                <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" title="取消引用" onClick={() => setQuotedMessage(null)}><X className="size-3.5" /></Button>
              </div>}
              <div className="flex flex-wrap items-center gap-2">
                <SelectBox value={messageType} onChange={(value) => setMessageType(value as "text" | "media")} className="w-full min-[360px]:w-[120px]"><option value="text">普通消息</option><option value="media">资源链接</option></SelectBox>
                <label><input className="hidden" type="file" accept="image/*" disabled={!selected} onChange={(event) => setImage(event.target.files?.[0] || null)} /><Button asChild variant="outline" size="sm" className={!selected ? "pointer-events-none opacity-50" : ""}><span><FileImage className="size-4" />选择图片</span></Button></label>
                {image && <span className="min-w-0 max-w-full flex-1 truncate text-xs text-muted-foreground sm:max-w-[240px]">{image.name}</span>}
                {image && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setImage(null)}>移除</Button>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea className="min-h-[76px] min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" value={draft} disabled={!selected} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder={selected ? messageType === "media" ? "输入图片、视频、语音或文件 URL；Enter 发送，Shift+Enter 换行" : "输入消息内容；Enter 发送，Shift+Enter 换行" : "请先选择好友或群"} />
                <Button className="h-10 w-full sm:h-[76px] sm:w-[92px]" onClick={send} disabled={!selected || sending || (!draft.trim() && !image)}><Send className="size-4" />{sending ? "发送中" : "发送"}</Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    <Dialog open={Boolean(rawMessage)} onOpenChange={(open) => { if (!open) setRawMessage(null); }}>
      <DialogContent>
        <DialogTitle>原始消息内容</DialogTitle>
        <DialogDescription>查看该消息未经显示层格式化的 OneBot 事件、消息原文和 PB 数据。</DialogDescription>
        {rawMessage && (() => {
          const pb = rawPbInfo(rawMessage);
          return <div className="space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>消息 ID：{String(rawMessage.message_id || rawMessage.id || "未知")}</span><span>时间：{String(rawMessage.timestamp || "未知")}</span></div>
          <div><p className="mb-1 text-xs font-medium text-muted-foreground">OneBot 原始事件</p><pre className="max-h-[36dvh] max-w-full overflow-auto rounded-md bg-muted p-3 text-xs leading-5">{rawMessageText(rawMessage)}</pre></div>
          {rawMessage.raw_content && <div><p className="mb-1 text-xs font-medium text-muted-foreground">原始消息文本</p><pre className="max-h-40 max-w-full overflow-auto rounded-md bg-muted p-3 text-xs leading-5">{String(rawMessage.raw_content)}</pre></div>}
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              <span>PB 原始数据</span>
              {pb && <><span>{String(pb.encoding || "hex").toUpperCase()}</span><span>{Number(pb.byte_length || 0).toLocaleString()} 字节</span>{pb.command && <span className="min-w-0 break-all font-normal">{String(pb.command)}</span>}</>}
            </div>
            {pb ? <pre className="max-h-[32dvh] max-w-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-200">{rawPbText(pb) || "PB 数据为空"}</pre> : <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">该消息来源未提供 PB 原始数据。注入 QQ 接收的新消息会在这里显示 PB；OneBot 接入是否提供取决于上游实现。</p>}
          </div>
        </div>;
        })()}
      </DialogContent>
    </Dialog>
  </section>;
}

function marketType(item: ApiData): "complete" | "single" | "module" {
  const value = String(item.type || "").toLowerCase();
  if (value === "module") return "module";
  if (["single", "standalone", "alone"].includes(value)) return "single";
  return "complete";
}

function marketAvatarUrl(item: ApiData) {
  const match = String(item.github || "").match(/github\.com\/([^/]+)/i);
  return match ? `https://github.com/${match[1]}.png?size=96` : "";
}

function marketOfficial(item: ApiData) {
  return String(item.github || "").toLowerCase().includes("elainacore/") || String(item.author || "").toLowerCase() === "elainaqq";
}

function marketPreviewFile(preview: ApiData): ApiData | null {
  const files = Array.isArray(preview.files) ? preview.files : [];
  return files.find((file: ApiData) => String(file.path || file.name) === String(preview.selected || "")) || files[0] || null;
}

function marketMarkdownHtml(preview: ApiData): string {
  const file = marketPreviewFile(preview);
  const content = String(file?.content || "");
  if (!content) return "";
  const initial = DOMPurify.sanitize(marked.parse(content, { gfm: true }) as string);
  const document = new DOMParser().parseFromString(initial, "text/html");
  const github = String(preview.item?.github || "");
  const match = github.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i);
  const branch = String(preview.item?.branch || "main");
  const filePath = String(file?.path || "").replaceAll("\\\\", "/");
  const directory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";
  const rawBase = match ? "https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + branch + "/" + directory : "";
  const blobBase = match ? "https://github.com/" + match[1] + "/" + match[2] + "/blob/" + branch + "/" + directory : "";

  document.querySelectorAll("img[src]").forEach((image) => {
    const source = image.getAttribute("src")?.trim() || "";
    if (source && !/^(?:data:|blob:|https?:|\/\/)/i.test(source) && rawBase) {
      try { image.setAttribute("src", new URL(source, rawBase).href); } catch { image.removeAttribute("src"); }
    }
    image.setAttribute("loading", "lazy");
    image.setAttribute("referrerpolicy", "no-referrer");
  });
  document.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href")?.trim() || "";
    if (href && !/^(?:https?:|mailto:|#|\/\/)/i.test(href) && blobBase) {
      try { link.setAttribute("href", new URL(href, blobBase).href); } catch { link.removeAttribute("href"); }
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer noopener");
  });
  return DOMPurify.sanitize(document.body.innerHTML, { ADD_ATTR: ["target", "rel", "loading", "referrerpolicy"] });
}

export function MarketPage() {
  const dialog = useAppDialog();
  const [items, setItems] = useState<ApiData[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [marketKind, setMarketKind] = useState<"complete" | "single" | "module">("complete");
  const [mirror, setMirror] = useState("");
  const [mirrors, setMirrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = async (refresh = false) => {
    setLoading(true);
    try {
      if (refresh) await api("/api/market/refresh", { method: "POST" });
      const [list, mirrorData] = await Promise.all([api<ApiData>("/api/market/list"), api<ApiData>("/api/market/mirror")]);
      setItems(Array.isArray(list.data) ? list.data : []);
      setMirror(String(mirrorData.mirror || ""));
      setMirrors(Array.isArray(mirrorData.mirrors) ? mirrorData.mirrors : []);
    } catch (error) { setNotice(errorMessage(error, "市场读取失败")); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveMirror = async (value: string) => {
    setMirror(value);
    try { await api("/api/market/mirror", { method: "POST", body: JSON.stringify({ mirror: value }) }); }
    catch (error) { setNotice(errorMessage(error, "镜像保存失败")); }
  };
  const changeInstall = async (item: ApiData) => {
    const removing = Boolean(item.installed && !item.has_update);
    if (removing && !await dialog.confirm({ title: "卸载插件", description: "卸载 " + item.name + "？插件代码会被移除，配置与数据将保留。", confirmLabel: "卸载", destructive: true })) return;
    try {
      await api(removing ? "/api/market/uninstall" : "/api/market/install", { method: "POST", body: JSON.stringify(removing ? { name: item.name, type: marketType(item), keep_data: true } : { ...item, type: marketType(item), mirror }) });
      setNotice(removing ? "卸载成功" : item.has_update ? "更新成功" : "安装成功"); await load();
    } catch (error) { setNotice(errorMessage(error, removing ? "卸载失败" : "安装失败")); }
  };
  const showPreview = async (item: ApiData) => {
    if (!item.github) return;
    try {
      const result = await api<ApiData>("/api/market/preview", {
        method: "POST",
        body: JSON.stringify({
          github: item.github,
          branch: item.branch || "main",
          path: item.path || "",
          mirror,
        }),
      });
      const files = Array.isArray(result.files) ? result.files : [];
      setPreview({
        item,
        ...result,
        selected: String(files[0]?.path || files[0]?.name || ""),
      });
    }
    catch (error) { setNotice(errorMessage(error, "预览失败")); }
  };

  const categories = [...new Set(items.filter((item) => marketType(item) === marketKind).map((item) => String(item.category || "")).filter(Boolean))];
  const query = search.trim().toLowerCase();
  const filtered = items.filter((item) => marketType(item) === marketKind).filter((item) => !category || String(item.category || "") === category).filter((item) => {
    if (!query) return true;
    return [item.name, item.description, item.author, ...(Array.isArray(item.tags) ? item.tags : [])].some((value) => String(value || "").toLowerCase().includes(query));
  });

  return <section className="space-y-4 sm:space-y-6">
    <FeatureHeading icon={PackageOpen} title="插件市场" detail="浏览社区插件、模块和扩展，安装前可查阅使用文档" />
    {notice && <Notice text={notice} error={notice.includes("失败")} />}
    <Card><CardContent className="p-3 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 rounded-md border bg-muted/30 p-0.5 sm:flex-none">{([["complete", "完整插件"], ["single", "独立插件"], ["module", "模块"]] as const).map(([value, label]) => <Button key={value} size="sm" className="min-w-0 flex-1 sm:flex-none" variant={marketKind === value ? "default" : "ghost"} onClick={() => { setMarketKind(value); setCategory(""); }}>{value === "module" ? <Boxes className="size-3.5" /> : <PackageOpen className="size-3.5" />}{label}</Button>)}</div>
        <Input className="min-w-[140px] flex-1 sm:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称、作者或标签" />
        <Button className="w-auto" onClick={() => load()}><Search className="size-3.5" />搜索</Button>
        <SelectBox value={category} onChange={setCategory} className="w-auto min-w-[130px]"><option value="">全部分类</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</SelectBox>
        <SelectBox value={mirror} onChange={saveMirror} className="w-auto min-w-[170px]"><option value="">自动选择镜像</option>{mirrors.map((value) => <option key={value} value={value}>{value || "GitHub 直连"}</option>)}</SelectBox>
        <span className="whitespace-nowrap text-xs text-muted-foreground">当前显示 {filtered.length} 个</span>
        <Button className="w-auto sm:ml-auto" variant="outline" onClick={() => load(true)}><RefreshCw className="size-3.5" />刷新仓库</Button>
      </div>
    </CardContent></Card>
    <Notice text="第三方插件由社区开发者提供，请在安装前确认来源和权限，框架不对第三方插件内容负责。" />
    {loading ? <Busy /> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.length ? filtered.map((item, index) => {
      const kind = marketType(item);
      const tags = (Array.isArray(item.tags) ? item.tags : []).map(String).filter((tag) => tag && tag.toLowerCase() !== String(item.category || "").toLowerCase());
      return <Card key={String(item.name || index)} className="flex h-full min-h-[220px] min-w-0 flex-col overflow-hidden">
        <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2"><div className="flex min-w-0 items-start gap-2.5">
          <LazyAvatar src={marketAvatarUrl(item)} label={String(item.name || "插件")} className="size-9 rounded-lg" />
          <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><CardTitle className="min-w-0 break-words text-base">{item.name || "未命名插件"}</CardTitle>{marketOfficial(item) && <Badge variant="secondary">官方</Badge>}</div><CardDescription className="mt-1 break-words">{item.author || "未知作者"}</CardDescription></div>
          <div className="flex shrink-0 flex-col items-end gap-1"><Badge variant={item.has_update ? "warning" : item.installed ? "success" : "secondary"}>{item.has_update ? "可更新" : item.installed ? "已安装" : kind === "module" ? "模块" : kind === "single" ? "独立" : "完整"}</Badge>{item.version && <span className="text-[11px] text-muted-foreground">v{item.version}</span>}</div>
        </div></CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2 p-3 pt-0 sm:p-4 sm:pt-0"><p className="min-h-8 break-words text-xs leading-5 text-muted-foreground">{item.description || "暂无描述"}</p>
          {(item.category || tags.length) && <div className="flex flex-wrap gap-1.5">{item.category && <Badge variant="outline">{item.category}</Badge>}{tags.slice(0, 5).map((tag) => <Badge key={tag} variant="secondary" className="font-normal">{tag}</Badge>)}</div>}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-2"><div className="flex min-w-0 items-center gap-2">{item.github && <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" href={String(item.github)} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" />仓库</a>}<span className="text-[11px] text-muted-foreground">{item.alone === false ? "独立目录" : kind === "module" ? "模块扩展" : "插件目录"}</span></div><div className="flex shrink-0 gap-1.5"><Button size="sm" variant="outline" onClick={() => showPreview(item)} disabled={!item.github}><FileText className="size-3.5" />文档</Button><Button size="sm" variant={item.installed && !item.has_update ? "outline" : "default"} className={item.installed && !item.has_update ? "text-destructive" : ""} onClick={() => changeInstall(item)}>{item.has_update ? <><RefreshCw className="size-3.5" />更新</> : item.installed ? <><Trash2 className="size-3.5" />卸载</> : <><Download className="size-3.5" />安装</>}</Button></div></div>
        </CardContent>
      </Card>;
    }) : <Card className="sm:col-span-2 xl:col-span-3"><CardContent className="p-10 text-center"><Notice text={query || category ? "没有匹配的插件" : "市场暂无可用插件或网络不可达"} /></CardContent></Card>}</div>}
    <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <DialogContent className="max-w-[920px] sm:w-[min(94vw,920px)]">
        {preview && (() => {
          const selectedFile = marketPreviewFile(preview);
          const html = marketMarkdownHtml(preview);
          return <>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 pr-2">
              <div className="min-w-0"><DialogTitle className="break-words">{preview.item?.name} 文档</DialogTitle><DialogDescription>插件仓库中的 README 和 Markdown 使用文档</DialogDescription></div>
              {Array.isArray(preview.files) && preview.files.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2"><SelectBox value={String(preview.selected || "")} onChange={(value) => setPreview((current) => current ? { ...current, selected: value } : current)} className="max-w-[240px] min-w-[150px]">{preview.files.map((file: ApiData) => <option key={String(file.path || file.name)} value={String(file.path || file.name)}>{String(file.name || file.path)}</option>)}</SelectBox><span className="whitespace-nowrap text-xs text-muted-foreground">{Number(selectedFile?.size || 0).toLocaleString()} 字节</span></div>}
            </div>
            {html ? <article className="market-markdown max-h-[70dvh] min-w-0 overflow-auto rounded-md border bg-background p-4 sm:p-6" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="grid min-h-[240px] place-items-center rounded-md border border-dashed bg-muted/30 p-6"><Notice text="当前插件目录没有 Markdown 文档" /></div>}
          </>;
        })()}
      </DialogContent>
    </Dialog>
  </section>;
}
