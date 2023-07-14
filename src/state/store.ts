import { type StateCreator, create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "./createSelectors";
import { type VariantEditorSlice, createVariantEditorSlice } from "./variantEditor.slice";

export type State = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  variantEditor: VariantEditorSlice;
};

export type SliceCreator<T> = StateCreator<State, [["zustand/immer", never]], [], T>;

export type SetFn = Parameters<SliceCreator<unknown>>[0];
export type GetFn = Parameters<SliceCreator<unknown>>[1];

const useBaseStore = create<State, [["zustand/immer", never]]>(
  immer((set, get, ...rest) => ({
    drawerOpen: false,
    openDrawer: () =>
      set((state) => {
        state.drawerOpen = true;
      }),
    closeDrawer: () =>
      set((state) => {
        state.drawerOpen = false;
      }),
    variantEditor: createVariantEditorSlice(set, get, ...rest),
  })),
);

export const useAppStore = createSelectors(useBaseStore);

useAppStore.getState().variantEditor.loadMonaco().catch(console.error);
