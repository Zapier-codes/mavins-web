import { create } from 'zustand';

interface AppState {
  points: number;
  setPoints: (points: number) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  points: 0,
  setPoints: (points) => set({ points }),
  sidebarOpen: false,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
