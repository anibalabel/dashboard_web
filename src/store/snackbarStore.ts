import { create } from 'zustand';

interface SnackbarState {
  message: string;
  type: 'success' | 'error' | 'info';
  isOpen: boolean;
  showSnackbar: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideSnackbar: () => void;
}

export const useSnackbarStore = create<SnackbarState>((set) => ({
  message: '',
  type: 'info',
  isOpen: false,
  showSnackbar: (message, type = 'info') => set({ message, type, isOpen: true }),
  hideSnackbar: () => set({ isOpen: false }),
}));
