"use client";
import {create} from "zustand";
import {persist} from "zustand/middleware";

export const AGENT_PANEL_MIN = 320, AGENT_PANEL_MAX = 640;

type WorkbenchLayoutState = {
    railCollapsed: boolean;
    inspectorOpen: boolean;
    autoMatchReferences: boolean;
    /** Agent 侧栏宽度（像素），可在侧栏与视频台交界处拖动调整。 */
    agentPanelWidth: number;
    setAgentPanelWidth: (width: number) => void;
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
            agentPanelWidth: 380,
            setAgentPanelWidth: (width: number) => set({agentPanelWidth: Math.round(Math.max(AGENT_PANEL_MIN, Math.min(AGENT_PANEL_MAX, width)))}),
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
