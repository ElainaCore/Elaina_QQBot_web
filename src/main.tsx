import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AppDialogProvider } from '@/components/ui/app-dialog';
import { ToastProvider } from '@/components/ui/toast';

createRoot(document.getElementById('root')!).render(
  <StrictMode><ToastProvider><AppDialogProvider><App /></AppDialogProvider></ToastProvider></StrictMode>,
);
