import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface ToastItem {
  id: string;
  message: string;
}

interface ToastState {
  items: ToastItem[];
}

const initialState: ToastState = { items: [] };

const toastSlice = createSlice({
  name: "toast",
  initialState,
  reducers: {
    addToast(state, action: PayloadAction<ToastItem>) {
      state.items.push(action.payload);
    },
    removeToast(state, action: PayloadAction<string>) {
      state.items = state.items.filter((t) => t.id !== action.payload);
    },
  },
});

export const { addToast, removeToast } = toastSlice.actions;
export default toastSlice.reducer;
