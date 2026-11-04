"use client";
import {create} from "zustand";
import {persist} from "zustand/middleware";

type WorkbenchLayoutState = {
    railCollapsed: boolean;
    inspectorOpen: boolean;
    autoMatchReferences: boolean;
    setAutoMatchReferences: (enabled: boolean) => void;
    toggleRail: () => void;
    toggleInspector: () => void;
    setInspectorOpen: (open: boolean) => void;
};

export const useWorkbenchLayoutStore = create<WorkbenchLayoutState>()(
    persist(
        set => ({
            railCollapsed: false,
            inspectorOpen: false,
            autoMatchReferences: true,
            setAutoMatchReferences: (enabled: boolean) => set({autoMatchReferences: enabled}),
            toggleRail: () => set(s => ({railCollapsed: !s.railCollapsed})),
            toggleInspector: () => set(s => ({inspectorOpen: !s.inspectorOpen})),
            setInspectorOpen: (open: boolean) => set({inspectorOpen: open}),
        }),
        {
            name: "xiaoxiao:layout",
            version: 2,
            migrate: (persisted: unknown) => ({
                railCollapsed: Boolean((persisted as {railCollapsed?: boolean} | null)?.railCollapsed),
                inspectorOpen: false,
            }),
        },
    ),
);
