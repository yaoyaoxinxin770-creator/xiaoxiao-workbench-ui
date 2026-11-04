"use client";
import {useWorkbenchLayoutStore} from "@/stores/use-workbench-layout-store";
import {LocalAssetMenu} from "./components/local-asset-menu";
import {dialogueHtml,PROMPT_HIGHLIGHT_CLASSES} from "./dialogue-highlight";
import {oiioiiReferenceLimits,isOiioiiConfig} from "@/services/api/oiioii";
import {OiioiiVideoParameters} from "@/components/oiioii-video-parameters";
import {applyProjectPrompt} from "./project-prompt";
import axios from "axios";
import {DreaminaVideoParameters,DreaminaInterpolationParameter} from "./components/dreamina-video-channel";
import {isDreaminaConfig,dreaminaVideoConfig,dreaminaReferenceLimits,isDreaminaTask,dreaminaVersionForConfig} from "@/services/api/dreamina";
import { resumeDreaminaDraft } from "@/services/api/dreamina";
import { localTaskId,canRecoverLocalVideoTask } from "./local-task-recovery";
import {workbench} from "@/services/api/workbench";
import { importLocalElements, refreshLocalAsset, syncLocalAssets } from "@/services/api/local-assets";
import { reusableProjectElement,sameElementSource } from "./element-model";
import type {ComposerReferenceState} from './composer-reference-state';
import {runningTaskItems} from "./running-tasks";
import {withSeedanceAudioBudget,seedanceAudioError} from "@/lib/seedance-audio";
import {ComposerGroupNavigation} from "./components/composer-group-navigation";
import {ImageReplacementTarget} from "./components/image-replacement-target";
import {replacePromptReferenceBindings} from './prompt-references';
import {withOiiGlobalVideo} from './oii-global-reference';
import {VideoFrameCapture} from './components/video-frame-capture';
import { PromptReferenceInput } from "./components/prompt-reference-input";
import {PromptMissingAssets} from "./components/prompt-missing-assets";
import {promptDuration} from "./prompt-duration";
import { restorePromptBindings,assetsForReference,projectReferenceAssets,matchPromptAssets,missingPromptReferences,repairPromptMentions,nameMatchesAsset } from "./prompt-references";
import { studioVideoNumber, type StudioVideoGroup } from "./studio-model";
import { shouldNotifyVideoCompletion,shouldNotifyVideoFailure } from "./video-completion";
import {referenceCardTarget} from "./reference-card-target";
import {locatePromptRange} from "./prompt-locate";
import { VideoReferencePicker } from "./components/video-reference-picker";

import { AlertCircle, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CheckSquare, ChevronDown, ChevronUp, ClipboardPaste, CloudUpload, Copy, Download, FolderPlus, Grip, History, ImageIcon, LoaderCircle, Music2, PanelBottom, PanelLeft, Pause, Plus, RotateCcw, SlidersHorizontal, Sparkles, Trash2, Upload, VideoIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { App, Button, Checkbox, Dropdown, Empty, Image, Input, Modal, Switch, Tag, Typography } from "antd";
import { createStore } from "@/lib/idb-store";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";

import { AssetPickerModal, type InsertAssetPayload } from "@/app/(user)/canvas/components/asset-picker-modal";
import { ModelPicker } from "@/components/model-picker";
import { PippitCreditIndicator } from "@/components/pippit-credit-indicator";
import { PippitVideoQuickControls } from "@/components/pippit-video-quick-controls";
import { isPippitConfig, ratioForSize, renderPippitDraft } from "@/services/api/pippit";
import { useAutoDLWorkflow } from "@/hooks/use-autodl-workflow";
import { getAutoDLCapabilities, isAutoDLConfig, normalizeAutoDLDuration } from "@/lib/autodl";
import { KlingV26WorkbenchPanel } from "@/app/(user)/video/components/kling-v26-workbench-panel";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { VideoSettingsPanel, isKIEKlingV3Config, kieKlingOmniVariant, normalizeVideoResolutionValue, normalizeVideoSizeValue, videoResolutionOptions, videoSizeForResolution, videoSizeOptions } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { isMiniMaxH3Config } from "@/lib/minimax-video";
import { ARK_SEEDANCE_REFERENCE_LIMITS, boolConfig, isSeedanceVideoConfig, normalizeSeedanceRatio, seedanceReferenceLabel, seedanceVideoReferenceError, seedanceVideoReferenceHint, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { COGVIDEOX3_DURATIONS, isAgnesVideoV25Model, isCogVideoX3Model, modelKey, normalizeCogVideoX3Duration, supportsVideoAudioGeneration, supportsVideoFrameReferences } from "@/lib/video-model-capabilities";
import { deleteStoredMedia, downloadRemoteMedia, resolveMediaUrl, uploadMediaFile, uploadRemoteMediaToServer } from "@/services/file-storage";
import { deleteStoredImages, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { deleteVideoGenerationLogs, fetchVideoGenerationLogs, saveVideoGenerationLogs } from "@/services/api/generation-logs";
import { createVideoGenerationTask, deleteVideoGenerationTask, listVideoGenerationTasks, pollVideoGenerationTaskStatus, VIDEO_POLL_INTERVAL_MS, VideoRequestError, type VideoResponse, type VideoTaskCreateOptions } from "@/services/api/video";
import { comfyOutputStorageKey, getWorkflowTask, isRetryableWorkflowError, submitWorkflowTask, workflowMediaSource } from "@/services/api/workflow-generation";
import {autoSyncPippitCanvas} from "@/services/api/pippit-canvas";
import { cleanVideoError } from "./video-error";
import { VideoStudio } from "./components/video-studio";
import { useVideoStudioStore } from "@/stores/use-video-studio-store";
import { archiveStudioVideo, archiveStudioProject, resolveLogVideoCandidates, resolvePlayableVideo } from "@/services/api/video-studio-files";
import { useWorkspaceTabsStore, projectTabId } from "@/stores/use-workspace-tabs-store";
import { useSearchParams } from "next/navigation";
import { placementFor } from "./studio-model";
import { useAssetStore, type Asset } from "@/stores/use-asset-store";
import { channelProtocolForConfig, normalizeLocalChannels, useConfigStore, useEffectiveConfig, type AiConfig, type VideoElementItem, type VideoElementReference } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { parseWorkflowRef, type WorkflowRef } from "@/lib/workflow-channel";

const cogVideoX3DurationOptions = COGVIDEOX3_DURATIONS.map((value) => ({ value, label: `${value}s` }));

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
    fallbackUrl?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    taskLogId?: string;
    createdAt: number;
    prompt: string;
    negativePrompt?: string;
    model: string;
    providerWorkflowRef?: WorkflowRef;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    firstFrame?: ReferenceImage | null;
    lastFrame?: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    taskCount?: number;
    durationMs?: number;
    progress?: number;
    task?: VideoResponse;
    video?: GeneratedVideo;
    error?: string;
    errorDetail?: string;
    lastPolledAt?: number;
    completionNotifiedAt?: number;
    failureNotifiedAt?: number;
};

export type GenerationLog = {
    interruptedAt?:number;
    id: string;
    draftRenderTaskId?: string;
    renderFromDraftTaskId?: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    providerWorkflowRef?: WorkflowRef;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    firstFrame?: ReferenceImage | null;
    lastFrame?: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    taskCount?: number;
    durationMs: number;
    size: string;
    resolution: string;
    seconds: string;
    status: "生成中" | "待核对" | "成功" | "失败";
    task?: VideoResponse;
    video?: GeneratedVideo;
    error?: string;
    errorDetail?: string;
    lastPolledAt?: number;
    completionNotifiedAt?: number;
    failureNotifiedAt?: number;
};

type GenerationLogConfig = Pick<AiConfig, "channelMode" | "activeChannelId" | "videoChannelId" | "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoMode" | "videoNegativePrompt" | "videoMultiShot" | "videoShotType" | "videoMultiPrompt" | "videoElementList" | "videoGenerateAudio" | "videoWatermark" | "videoCharacterOrientation" | "dreaminaInterpolationFps">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
type WorkbenchLayout = "side" | "bottom";
type AssetPickerTarget = "general" | "image" | "video" | "audio" | "firstFrame" | "lastFrame" | "element";
type WorkflowPollContext = { token: string; signal: AbortSignal };

const WORKBENCH_LAYOUT_KEY = "infinite-canvas:video-workbench-layout";
const logStore = createStore("video_generation_logs");
export default function VideoPage() {
    const { message,modal } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const studioReady = useVideoStudioStore(state => state.ready);
    const projectId = useVideoStudioStore(state=>state.activeProjectId);
    const params = useSearchParams();
    useEffect(()=>{const id=params.get("project");if(studioReady && id)useVideoStudioStore.getState().selectProject(id);},[params,studioReady]);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const elementFileInputRef = useRef<HTMLInputElement>(null);
    const firstFrameInputRef = useRef<HTMLInputElement>(null);
    const lastFrameInputRef = useRef<HTMLInputElement>(null);
    const baseEffectiveConfig = useEffectiveConfig();
    const localConfig = useConfigStore(state=>state.config);
    const effectiveConfig = useMemo(()=>localConfig.videoStudioProvider === "dreamina" ? dreaminaVideoConfig(baseEffectiveConfig,localConfig) : baseEffectiveConfig,[baseEffectiveConfig,localConfig]);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const videoConfig = useMemo(() => ({ ...effectiveConfig, size: effectiveConfig.videoSize }), [effectiveConfig]);
    const updateVideoConfig = useCallback<UpdateAiConfig>((key, value) => {
        if (localConfig.videoStudioProvider === "dreamina" && ["size","videoModel","videoSeconds","vquality"].includes(key)) {
            const prefsKey=localConfig.dreaminaVersion==="legacy"?"dreaminaPreferences":"dreaminaCanvasPreferences";updateConfig(prefsKey,{...useConfigStore.getState().config[prefsKey],[key==="size"?"videoSize":key]:value});return;
        }
        if (key === "size") {
            updateConfig("videoSize", String(value));
            return;
        }
        updateConfig(key, value);
    }, [updateConfig,localConfig.videoStudioProvider,localConfig.dreaminaVersion]);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const token = useUserStore((state) => state.token);
    const userId = useUserStore((state) => state.user?.id || "");
    const isUserReady = useUserStore((state) => state.isReady);
    const [prompt, setPrompt] = useState("");
    const [negativePrompt, setNegativePrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [firstFrame, setFirstFrame] = useState<ReferenceImage | null>(null);
    const [lastFrame, setLastFrame] = useState<ReferenceImage | null>(null);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [referencesUploading, setReferencesUploading] = useState(false);
    const referenceUploadsRef = useRef(0);
    const composerRevision = useRef(0);
    const loadedGroup=useRef("");
    const loadedOrigin=useRef<{groupId:string;projectId:string;folderId:string}|null>(null);
    const [matchIssues,setMatchIssues]=useState<string[]>([]);
    const [referenceBindings,setReferenceBindings]=useState<Record<string,string>>({});
    const currentBindings=useRef(referenceBindings);currentBindings.current=referenceBindings;
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [workbenchLayout, setWorkbenchLayoutState] = useState<WorkbenchLayout>("side");
    const [bottomSettingsCollapsed, setBottomSettingsCollapsed] = useState(true);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget>("general");
    const [fillAsset,setFillAsset]=useState<Asset|null>(null);
    const [bindingReplacement,setBindingReplacement]=useState<{id:string;kind:string}|null>(null);
    const [bindingTarget,setBindingTarget]=useState<{name:string;kind:string}|null>(null);
    const [elementPickerIndex, setElementPickerIndex] = useState(0);
    const [elementUploadIndex, setElementUploadIndex] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [focusSceneRevision,setFocusSceneRevision]=useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [taskCount, setTaskCount] = useState(1);
    const [syncingVideoIds, setSyncingVideoIds] = useState<string[]>([]);
    const pollingLogIdsRef = useRef(new Set<string>());
    const notifiedVideoIdsRef = useRef(new Set<string>());
    const notifiedFailureIdsRef = useRef(new Set<string>());
    const logsRef = useRef<GenerationLog[]>([]);
    const effectiveConfigRef = useRef(videoConfig);
    const enqueueingRef = useRef(false);

    const draftRef=useRef<{id:string;draft:any}|null>(null), restoring=useRef(false);
    useLayoutEffect(()=>{
        if(!studioReady || draftRef.current?.id===projectId)return;
        if(draftRef.current)useVideoStudioStore.getState().saveDraft(draftRef.current.id,draftRef.current.draft);
        const draft=useVideoStudioStore.getState().drafts[projectId]||{};
        composerRevision.current += 1;
        restoring.current=true;draftRef.current={id:projectId,draft};
        setPrompt(draft.prompt||"");setNegativePrompt(draft.negativePrompt||"");setReferences(draft.references||[]);setFirstFrame(draft.firstFrame||null);setLastFrame(draft.lastFrame||null);setVideoReferences(draft.videoReferences||[]);setAudioReferences(draft.audioReferences||[]);
        void Promise.all((draft.references||[]).map(async(item:ReferenceImage)=>({...item,dataUrl:await safeResolveImageUrl(item.storageKey,item.dataUrl)}))).then(value=>setReferences(current=>current===draft.references?value:current));
        void Promise.all((draft.videoReferences||[]).map(async(item:ReferenceVideo)=>({...item,url:await safeResolveMediaUrl(item.storageKey||"",item.url)}))).then(value=>setVideoReferences(current=>current===draft.videoReferences?value:current));
        void Promise.all((draft.audioReferences||[]).map(async(item:ReferenceAudio)=>({...item,url:await safeResolveMediaUrl(item.storageKey||"",item.url)}))).then(value=>setAudioReferences(current=>current===draft.audioReferences?value:current));
        if(draft.firstFrame)void safeResolveImageUrl(draft.firstFrame.storageKey,draft.firstFrame.dataUrl).then(url=>setFirstFrame(current=>current&&current===draft.firstFrame?{...current,dataUrl:url}:current));
        if(draft.lastFrame)void safeResolveImageUrl(draft.lastFrame.storageKey,draft.lastFrame.dataUrl).then(url=>setLastFrame(current=>current&&current===draft.lastFrame?{...current,dataUrl:url}:current));
        setReferenceBindings(draft.referenceBindings||{});setMatchIssues(draft.matchIssues||[]);setTaskCount(draft.taskCount||1);loadedGroup.current=draft.loadedGroup||"";const sourceGroup=useVideoStudioStore.getState().groups.find(g=>g.id===loadedGroup.current);loadedOrigin.current=draft.loadedOrigin||(sourceGroup?{groupId:sourceGroup.id,projectId:sourceGroup.projectId,folderId:sourceGroup.folderId}:null);
    },[projectId,studioReady]);
    useEffect(()=>{
        if(!studioReady)return;if(restoring.current){restoring.current=false;return;}
        const draft={referenceBindings,prompt,negativePrompt,references,firstFrame,lastFrame,videoReferences,audioReferences,matchIssues,taskCount,loadedGroup:loadedGroup.current,loadedOrigin:loadedOrigin.current};
        draftRef.current={id:projectId,draft};
        useVideoStudioStore.getState().saveDraft(projectId,draft);
    },[projectId,studioReady,prompt,negativePrompt,references,firstFrame,lastFrame,videoReferences,audioReferences,matchIssues,taskCount,referenceBindings]);
    useEffect(()=>{const flush=()=>{const latest=draftRef.current;if(latest)useVideoStudioStore.getState().saveDraft(latest.id,latest.draft);};window.addEventListener("pagehide",flush);return()=>{window.removeEventListener("pagehide",flush);flush();};},[]);
    const studioPlacements=useVideoStudioStore(s=>s.placements),studioGroups=useVideoStudioStore(s=>s.groups),studioProjects=useVideoStudioStore(s=>s.projects);
    useEffect(()=>{const tabs=useWorkspaceTabsStore.getState(),items=runningTaskItems(logs,studioProjects,studioGroups,studioPlacements);tabs.setTaskItems(items);for(const project of studioProjects){const id=projectTabId('video',project.id),count=items.filter(item=>item.projectId===project.id&&item.active).length;tabs.setBusy(id,count>0);tabs.setTaskCount(id,count);}},[logs,studioProjects,studioGroups,studioPlacements]);
    useEffect(()=>{const onRemove=(event:Event)=>{const id=(event as CustomEvent).detail?.id;if(!id)return;const target=logsRef.current.find(l=>l.id===id),related=logsRef.current.filter(l=>l.id===id||(target?.task?.id&&l.task?.id===target.task.id));const trashedAt=Date.now();useVideoStudioStore.getState().place(related.length?related.map(l=>l.id):[id],{trashedAt});for(const item of related){interruptedLogIdsRef.current.add(item.id);if(!item.video&&item.status!=="成功"&&item.status!=="失败"){const next={...item,interruptedAt:item.interruptedAt||trashedAt,status:"待核对" as const,lastPolledAt:trashedAt};logsRef.current=logsRef.current.map(v=>v.id===item.id?next:v);void saveGenerationLog(next);}}setResults(value=>value.filter(r=>!related.some(item=>r.taskLogId===item.id||r.id===item.id)&&r.taskLogId!==id&&r.id!==id));};window.addEventListener("xiaoxiao:remove-workbench-task",onRemove);return()=>window.removeEventListener("xiaoxiao:remove-workbench-task",onRemove);},[]);
    useEffect(()=>useVideoStudioStore.subscribe((next,previous)=>{
        if(next.activeProjectId!==projectId)return;
        const id=loadedGroup.current,before=previous.groups.find(group=>group.id===id),after=next.groups.find(group=>group.id===id),draft=next.drafts[projectId];
        if(before?.prompt===after?.prompt||draft===previous.drafts[projectId]||draft?.loadedGroup!==id)return;
        composerRevision.current++;draftRef.current={id:projectId,draft};setPrompt(draft.prompt||"");
    }),[projectId]);
    const model = effectiveConfig.videoModel;
    const referenceLimits = withSeedanceAudioBudget(model, isOiioiiConfig({...videoConfig,model}) ? oiioiiReferenceLimits(videoConfig,model) : isDreaminaConfig({...videoConfig,model}) ? dreaminaReferenceLimits(videoConfig,model) : !videoConfig.videoWorkflowRef && channelProtocolForConfig({ ...videoConfig, model, videoModel: model }) === "ark" && modelKey(model).includes("seedance-2-5") ? ARK_SEEDANCE_REFERENCE_LIMITS : SEEDANCE_REFERENCE_LIMITS);
    const autodl = !videoConfig.videoWorkflowRef && isAutoDLConfig(videoConfig, model);
    const { data: autodlWorkflow, error: autodlError } = useAutoDLWorkflow(videoConfig, model);
    const autodlCapabilities = getAutoDLCapabilities(autodlWorkflow);
    const canGenerate = studioReady && !running && !referencesUploading && (Boolean(prompt.trim() || videoConfig.videoWorkflowRef) || (autodl && autodlCapabilities?.promptRequired === false));
    const pendingCount = results.filter((item) => item.status === "pending").length;
    const klingWorkbench = videoConfig.videoWorkflowRef ? null : resolveKlingWorkbenchConfig(videoConfig, model);
    const klingWorkbenchVariant = klingWorkbench?.variant || "";
    const klingWorkbenchProvider = klingWorkbench?.provider || "apimart";
    const isKlingWorkbench = Boolean(klingWorkbench);
    const klingOmni = videoConfig.videoWorkflowRef ? "" : kieKlingOmniVariant(videoConfig, model);
    const klingAcceptsVideoReferences = klingOmni === "reference-to-video" || klingOmni === "transformation";
    const referenceImageLimit = klingOmni === "text-to-video" ? 0 : klingOmni === "image-to-video" ? 2 : klingOmni === "transformation" ? 4 : isKlingWorkbench && klingOmni !== "reference-to-video" ? 2 : referenceLimits.images;
    const videoReferenceLimit = klingAcceptsVideoReferences ? 1 : referenceLimits.videos;
    const pendingLogCount = logs.filter((log) => log.status === "生成中" && log.task && !log.video).length;
    const interruptedLogIdsRef=useRef(new Set<string>());
    const pollableLogCount = logs.filter(log=>!log.interruptedAt&&["生成中","待核对"].includes(log.status)&&log.task&&!log.video).length;
    const usesBackendVideoTasks = (value: AiConfig) => !isDreaminaConfig(value) && value.channelMode === "remote" || (value.channelMode === "local" && Boolean(token));

    useEffect(() => {
        if (autodl && autodlError) message.error(autodlError.message);
    }, [autodl, autodlError, message]);

    const restorePendingLogResults = (sourceLogs: GenerationLog[]) => {
        const pendingLogs = sourceLogs.filter((log) => log.status === "生成中" && log.task && !log.video);
        if (!pendingLogs.length) return;
        setResults((value) => mergePendingLogResults(value, pendingLogs));
    };

    const pollPendingLogsOnce = (sourceLogs: GenerationLog[], context: WorkflowPollContext) => {
        const pendingLogs = sourceLogs.filter(log=>!log.interruptedAt&&log.task&&!log.video&&(log.status==="生成中"||log.status==="待核对"&&Date.now()-(log.lastPolledAt||0)>=(log.task?.preparationOnly&&log.task.status==="awaiting_confirmation"?VIDEO_POLL_INTERVAL_MS:30000)));
        if (!pendingLogs.length) return;
        pendingLogs.forEach((log) => {
            if (pollingLogIdsRef.current.has(log.id)) return;
            const resumeConfig = buildResumeVideoConfig(effectiveConfigRef.current, log);
            const taskId = videoLogTaskId(log);
            if (!taskId || (!isDreaminaTask(taskId) && !log.providerWorkflowRef && !isAiConfigReady(resumeConfig, log.model))) return;
            if (log.providerWorkflowRef && !context.token) return;
            if (isLocalClientVideoLog(log) && (localTaskId(log) || !usesBackendVideoTasks(resumeConfig))) return;
            void pollPendingLogOnce(log, resumeConfig, context);
        });
    };

    const recoveredTaskIds=logs.filter(log=>!log.video&&!log.task?.remoteOnly&&localTaskId(log)&&log.status!=="生成中"&&canRecoverLocalVideoTask(log)).map(log=>localTaskId(log)!).join("|");
    useEffect(()=>{
        if(!recoveredTaskIds||!window.desktopBridge?.localVideoTaskStates)return;const controller=new AbortController(),context={token:token||"",signal:controller.signal};let busy=false;
        const recover=async()=>{if(busy)return;busy=true;try{const ids=[...new Set(recoveredTaskIds.split("|"))],states=(await Promise.all(Array.from({length:Math.ceil(ids.length/1000)},(_,i)=>workbench().localVideoTaskStates(ids.slice(i*1000,(i+1)*1000))))).flat();if(controller.signal.aborted)return;for(const item of states){if(!["completed","processing","awaiting_interpolation"].includes(item.status))continue;const log=logsRef.current.find(l=>localTaskId(l)===item.id&&!l.video&&!l.task?.remoteOnly);if(log&&canRecoverLocalVideoTask(log)&&!pollingLogIdsRef.current.has(log.id))await pollPendingLogOnce({...log,task:{...log.task!,id:item.id},status:"生成中",error:undefined,errorDetail:undefined},buildResumeVideoConfig(effectiveConfigRef.current,log),context);}}catch{/* Failed records stay intact when the local service is unavailable. */}finally{busy=false;}};void recover();const timer=window.setInterval(()=>void recover(),30000);return()=>{controller.abort();window.clearInterval(timer);};
    },[recoveredTaskIds,token]);
    useEffect(() => {
        if (!pendingCount && !pendingLogCount) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [pendingCount, pendingLogCount]);

    useEffect(() => {
        logsRef.current = logs;
    }, [logs]);

    useEffect(() => {
        if (!pollableLogCount) return;
        const controller = new AbortController();
        const context = { token: token || "", signal: controller.signal };
        const kickoff = window.setTimeout(() => pollPendingLogsOnce(logsRef.current, context), 300);
        const timer = window.setInterval(() => {
            pollPendingLogsOnce(logsRef.current, context);
        }, VIDEO_POLL_INTERVAL_MS);
        return () => {
            controller.abort();
            window.clearTimeout(kickoff);
            window.clearInterval(timer);
        };
    }, [pollableLogCount, token, userId]);

    useEffect(() => {
        try {
            const storedLayout = window.localStorage?.getItem(WORKBENCH_LAYOUT_KEY);
            if (storedLayout === "side" || storedLayout === "bottom") setWorkbenchLayoutState(storedLayout);
        } catch {
            // Keep the default layout when localStorage is unavailable.
        }
    }, []);

    useEffect(() => {
        effectiveConfigRef.current = videoConfig;
    }, [videoConfig]);

    useEffect(() => {
        restorePendingLogResults(logs);
    }, [logs]);

    useEffect(() => {
        if (!isUserReady) return;
        if (token) {
            void loadAccountVideoHistory().then((items) => syncBackendVideoTasks(items));
            return;
        }
        void refreshLogs().then((items) => syncBackendVideoTasks(items));
    }, [isUserReady, token]);

    const setWorkbenchLayout = (layout: WorkbenchLayout) => {
        setWorkbenchLayoutState(layout);
        try {
            window.localStorage?.setItem(WORKBENCH_LAYOUT_KEY, layout);
        } catch {
            // Keep the in-memory layout when localStorage is unavailable.
        }
    };

    const pastePromptFromClipboard = async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (!text) {
                message.error("剪切板里没有可读取的文本");
                return;
            }
            setPrompt(text);
            message.success("已读取剪切板文本");
        } catch {
            message.error("剪切板里没有可读取的文本");
        }
    };

    const openAssetPicker = (target: AssetPickerTarget = "general") => {
        setBindingTarget(null);setBindingReplacement(null);
        setAssetPickerTarget(target);
        setAssetPickerOpen(true);
    };

    const openElementAssetPicker = (index: number) => {
        setElementPickerIndex(index);
        openAssetPicker("element");
    };

    const uploadElementReferences = (index: number) => {
        setElementUploadIndex(index);
        elementFileInputRef.current?.click();
    };

    const updateElementList = (items: VideoElementItem[]) => {
        updateConfig("videoElementList", normalizeKlingElementList(items));
    };

    const updateElementReferences = (elementIndex: number, updater: (references: VideoElementReference[]) => VideoElementReference[]) => {
        const list = normalizeKlingElementList(effectiveConfig.videoElementList);
        updateElementList(list.map((item, index) => index === elementIndex ? { ...item, references: updater(item.references).slice(0, 4) } : item));
    };

    const addElementReferences = async (elementIndex: number, files?: FileList | null) => {
        const revision = composerRevision.current;
        const selectedFiles = Array.from(files || []);
        const list = normalizeKlingElementList(effectiveConfig.videoElementList);
        const current = list[elementIndex];
        if (!current) return;
        const usable = selectedFiles.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || isSupportedAudioFile(file)).slice(0, Math.max(0, 4 - current.references.length));
        const unsupported = selectedFiles.length - usable.length;
        if (unsupported > 0) message.warning("已忽略超出数量或不支持的元素资源");
        const hideLoading = usable.length ? message.loading("正在上传元素资源...", 0) : null;
        try {
            const next = await Promise.all(usable.map(uploadElementReferenceFile));
            const filtered = next.filter((item): item is VideoElementReference => Boolean(item));
            if (revision !== composerRevision.current) return;
            updateElementReferences(elementIndex, (value) => [...value, ...filtered]);
            if (filtered.length) message.success(`已上传 ${filtered.length} 个元素资源`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "元素资源上传失败");
        } finally {
            hideLoading?.();
        }
    };

    const addElementReferencesFromClipboard = async (elementIndex: number) => {
        const revision = composerRevision.current;
        try {
            const list = normalizeKlingElementList(effectiveConfig.videoElementList);
            const current = list[elementIndex];
            if (!current) return;
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪贴板里没有可读取的图片");
                return;
            }
            const next = await Promise.all(blobs.slice(0, Math.max(0, 4 - current.references.length)).map(async (blob, index) => {
                const image = await uploadImage(blob);
                return { id: nanoid(), kind: "image" as const, name: `clipboard-element-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }));
            if (revision !== composerRevision.current) return;
            updateElementReferences(elementIndex, (value) => [...value, ...next]);
            message.success(`已读取 ${next.length} 个元素图片`);
        } catch {
            message.error("剪贴板里没有可读取的图片");
        }
    };

    const removeElementReference = (elementIndex: number, id: string) => {
        updateElementReferences(elementIndex, (value) => value.filter((item) => item.id !== id));
    };

    const moveElementReference = (elementIndex: number, index: number, offset: number) => {
        updateElementReferences(elementIndex, (value) => moveListItem(value, index, offset));
    };

    const addReferences = async (files?: FileList | null) => {
        const revision = composerRevision.current;
        const selectedFiles = Array.from(files || []);
        const unsupported = isKlingWorkbench ? selectedFiles.filter((file) => (!file.type.startsWith("image/") || referenceImageLimit === 0) && (!file.type.startsWith("video/") || !klingAcceptsVideoReferences)) : selectedFiles.filter((file) => !file.type.startsWith("image/") && !file.type.startsWith("video/") && !isSupportedAudioFile(file));
        if (unsupported.length) message.warning(isKlingWorkbench ? `当前 Kling 模型仅支持${klingAcceptsVideoReferences ? "参考图和参考视频" : "参考图"}` : "已忽略不支持的参考素材，请使用图片、mp4/mov 视频或 mp3/wav 音频");
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/") && file.size <= SEEDANCE_REFERENCE_LIMITS.imageMaxBytes).slice(0, Math.max(0, referenceImageLimit - references.length));
        const videoFiles = isKlingWorkbench && !klingAcceptsVideoReferences ? [] : selectedFiles.filter((file) => file.type.startsWith("video/") && file.size <= referenceLimits.videoMaxBytes).slice(0, Math.max(0, videoReferenceLimit - videoReferences.length));
        const audioFiles = isKlingWorkbench ? [] : selectedFiles.filter((file) => isSupportedAudioFile(file) && file.size <= SEEDANCE_REFERENCE_LIMITS.audioMaxBytes).slice(0, referenceLimits.audios - audioReferences.length);
        if (selectedFiles.some((file) => file.type.startsWith("image/") && file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes)) message.warning("已忽略超过 30MB 的参考图");
        if (selectedFiles.some((file) => file.type.startsWith("video/") && file.size > referenceLimits.videoMaxBytes)) message.warning(`已忽略超过 ${referenceLimits.videoMaxBytes / 1024 / 1024}MB 的参考视频`);
        if (selectedFiles.some((file) => isSupportedAudioFile(file) && file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes)) message.warning("已忽略超过 15MB 的参考音频");
        const hideLoading = imageFiles.length ? message.loading("正在上传参考图...", 0) : null;
        referenceUploadsRef.current += 1;
        setReferencesUploading(true);
        try {
            const nextReferences = await Promise.all(
                imageFiles.map(async (file) => {
                    const image = await uploadImage(file);
                    return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            const nextVideoReferences = await Promise.all(
                videoFiles.map(async (file) => {
                    const video = await uploadMediaFile(file, "video-reference");
                    return { id: nanoid(), name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
                }),
            );
            const uploadedAudioReferences = await Promise.all(audioFiles.map(async (file) => {
                const audio = await uploadMediaFile(file, "audio-reference");
                return { id: nanoid(), name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
            }));
            const nextAudioReferences = autodl ? uploadedAudioReferences : filterAudioReferencesByDuration(audioReferences, uploadedAudioReferences, referenceLimits, message.warning);
            if (revision !== composerRevision.current) return;
            registerProjectReferences(nextReferences, nextVideoReferences, nextAudioReferences);
            if (revision !== composerRevision.current) return;
            setReferences((value) => [...value, ...nextReferences].slice(0, referenceImageLimit));
            if (revision !== composerRevision.current) return;
            setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, videoReferenceLimit));
            if (revision !== composerRevision.current) return;
            setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, referenceLimits.audios));
            if (nextReferences.length) message.success(`已上传 ${nextReferences.length} 张参考图`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "参考素材上传失败");
        } finally {
            hideLoading?.();
            referenceUploadsRef.current -= 1;
            if (referenceUploadsRef.current === 0) setReferencesUploading(false);
        }
    };

    const uploadFrameReference = async (slot: "first" | "last", files?: FileList | null) => {
        const revision = composerRevision.current;
        const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
        if (!file) {
            message.error("请选择首尾帧图片");
            return;
        }
        if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
            message.warning("已忽略超过 30MB 的首尾帧图片");
            return;
        }
        const hideLoading = message.loading(slot === "first" ? "正在上传首帧..." : "正在上传尾帧...", 0);
        try {
            const image = await uploadImage(file);
            const next = { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            if (revision !== composerRevision.current) return;
            slot === "first" ? setFirstFrame(next) : setLastFrame(next);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "首尾帧上传失败");
        } finally {
            hideLoading();
        }
    };

    const uploadElementReferenceFile = async (file: File): Promise<VideoElementReference | null> => {
        if (file.type.startsWith("image/")) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) return null;
            const image = await uploadImage(file);
            return { id: nanoid(), kind: "image", name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
        }
        if (file.type.startsWith("video/")) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return null;
            const video = await uploadMediaFile(file, "video-reference");
            if (video.durationMs && (video.durationMs < 3000 || video.durationMs > 8000)) {
                message.warning("已忽略不符合时长要求的元素视频：3-8 秒");
                return null;
            }
            return { id: nanoid(), kind: "video", name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
        }
        if (isSupportedAudioFile(file)) {
            if (file.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes) return null;
            const audio = await uploadMediaFile(file, "audio-reference");
            if (audio.durationMs && (audio.durationMs < 5000 || audio.durationMs > 30000)) {
                message.warning("已忽略不符合时长要求的元素音频：5-30 秒");
                return null;
            }
            return { id: nanoid(), kind: "audio", name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
        }
        return null;
    };

    const addReferencesFromClipboard = async () => {
        const revision = composerRevision.current;
        if (!referenceImageLimit) {
            message.warning("当前 Kling 模型不支持参考图");
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            const nextReferences = await Promise.all(
                blobs.slice(0, Math.max(0, referenceImageLimit - references.length)).map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            if (revision !== composerRevision.current) return;
            setReferences((value) => [...value, ...nextReferences].slice(0, referenceImageLimit));
            message.success(`已读取 ${nextReferences.length} 张参考图`);
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const setFrameFromClipboard = async (slot: "first" | "last") => {
        const revision = composerRevision.current;
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            const blob = blobs[0];
            if (!blob) {
                message.error("剪切板里没有可读取的图片");
                return;
            }
            if (blob.size > SEEDANCE_REFERENCE_LIMITS.imageMaxBytes) {
                message.warning("已忽略超过 30MB 的首尾帧图片");
                return;
            }
            const hideLoading = message.loading(slot === "first" ? "正在读取首帧..." : "正在读取尾帧...", 0);
            try {
                const image = await uploadImage(blob);
                const next = { id: nanoid(), name: slot === "first" ? "clipboard-first-frame.png" : "clipboard-last-frame.png", type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                if (revision !== composerRevision.current) return;
            slot === "first" ? setFirstFrame(next) : setLastFrame(next);
                message.success(slot === "first" ? "已读取首帧" : "已读取尾帧");
            } finally {
                hideLoading();
            }
        } catch {
            message.error("剪切板里没有可读取的图片");
        }
    };

    const addVideoReferencesFromClipboard = async () => {
        const revision = composerRevision.current;
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("video/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的视频");
                return;
            }
            const usable = blobs.filter((blob) => blob.size <= referenceLimits.videoMaxBytes).slice(0, Math.max(0, videoReferenceLimit - videoReferences.length));
            if (blobs.some((blob) => blob.size > referenceLimits.videoMaxBytes)) message.warning(`已忽略超过 ${referenceLimits.videoMaxBytes / 1024 / 1024}MB 的参考视频`);
            const nextVideoReferences = await Promise.all(
                usable.map(async (blob, index) => {
                    const video = await uploadMediaFile(blob, "video-reference");
                    return { id: nanoid(), name: `clipboard-video-${index + 1}.mp4`, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
                }),
            );
            if (revision !== composerRevision.current) return;
            setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, videoReferenceLimit));
            message.success(`已读取 ${nextVideoReferences.length} 个参考视频`);
        } catch {
            message.error("剪切板里没有可读取的视频");
        }
    };

    const addAudioReferencesFromClipboard = async () => {
        const revision = composerRevision.current;
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("audio/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error("剪切板里没有可读取的音频");
                return;
            }
            const usable = blobs.filter((blob) => blob.size <= SEEDANCE_REFERENCE_LIMITS.audioMaxBytes).slice(0, referenceLimits.audios - audioReferences.length);
            if (blobs.some((blob) => blob.size > SEEDANCE_REFERENCE_LIMITS.audioMaxBytes)) message.warning("已忽略超过 15MB 的参考音频");
            const uploadedAudioReferences = await Promise.all(usable.map(async (blob, index) => {
                const audio = await uploadMediaFile(blob, "audio-reference");
                return { id: nanoid(), name: `clipboard-audio-${index + 1}.mp3`, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
            }));
            const nextAudioReferences = autodl ? uploadedAudioReferences : filterAudioReferencesByDuration(audioReferences, uploadedAudioReferences, referenceLimits, message.warning);
            if (revision !== composerRevision.current) return;
            setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, referenceLimits.audios));
            message.success(`已读取 ${nextAudioReferences.length} 个参考音频`);
        } catch {
            message.error("剪切板里没有可读取的音频");
        }
    };

    const excludeReference=(reference:ReferenceImage|ReferenceVideo|ReferenceAudio|undefined,kind:string)=>{
        if(!reference)return;
        const found=assetsForReference(useAssetStore.getState().assets,reference,kind),next={...currentBindings.current};
        if(found.length)for(const asset of useAssetStore.getState().assets.filter(a=>found.some(f=>sameElementSource(a,f)))){next['omit:asset:'+asset.id]=asset.id;delete next['preserve:asset:'+asset.id];}
        else next['omit:'+kind+':'+reference.name.normalize('NFKC').trim()]=reference.assetId||reference.id;
        if(reference.assetId)delete next['preserve:asset:'+reference.assetId];
        currentBindings.current=next;setReferenceBindings(next);
    };
    const removeReference=async(id:string)=>{const ref=currentRefs.current.images.find(r=>r.id===id);excludeReference(ref,'image');currentRefs.current.images=currentRefs.current.images.filter(r=>r.id!==id);setReferences(currentRefs.current.images);};

    const removeFrameReference=async(slot:'first'|'last')=>{slot==='first'?setFirstFrame(null):setLastFrame(null);};
    const removeVideoReference=async(id:string)=>{const ref=currentRefs.current.video.find(r=>r.id===id);excludeReference(ref,'video');currentRefs.current.video=currentRefs.current.video.filter(r=>r.id!==id);setVideoReferences(currentRefs.current.video);};
    const removeAudioReference=async(id:string)=>{const ref=currentRefs.current.audio.find(r=>r.id===id);excludeReference(ref,'audio');currentRefs.current.audio=currentRefs.current.audio.filter(r=>r.id!==id);setAudioReferences(currentRefs.current.audio);};

    const generate = async () => {
        if (referenceUploadsRef.current > 0) {
            message.warning("参考素材还在准备中，请稍候再生成");
            return;
        }
        const revision=composerRevision.current,project=useVideoStudioStore.getState().projects.find(p=>p.id===projectId),effective=applyProjectPrompt(prompt,project?.globalPrompt);
        if(useWorkbenchLayoutStore.getState().autoMatchReferences&&(isDreaminaConfig(videoConfig)||isOiioiiConfig(videoConfig)||Object.keys(project?.elementRules||{}).length||project?.globalPrompt?.enabled)&&!firstFrame&&!lastFrame){await autoMatchPrompt(effective.prompt,currentBindings.current,false);}
        if(revision!==composerRevision.current||projectId!==useVideoStudioStore.getState().activeProjectId)return;
        if(effective.missingHeading)message.info("本组没有指定标题，全局提示词已追加到结尾");
        const snapshot = buildRequestSnapshot({promptText:effective.prompt,referenceItems:currentRefs.current.images,videoReferenceItems:currentRefs.current.video,audioReferenceItems:currentRefs.current.audio,taskCountValue:1});
        if (!snapshot) return;
        if(!loadedGroup.current)setPrompt("");
        await submitGenerationSnapshot(snapshot);
    };

    const buildRequestSnapshot = ({ promptText = prompt, negativePromptText, referenceItems = references, firstFrameItem = firstFrame, lastFrameItem = lastFrame, videoReferenceItems = videoReferences, audioReferenceItems = audioReferences, taskCountValue = taskCount, configValue = videoConfig, modelValue = model, workflowRef = videoConfig.videoWorkflowRef }: { promptText?: string; negativePromptText?: string; referenceItems?: ReferenceImage[]; firstFrameItem?: ReferenceImage | null; lastFrameItem?: ReferenceImage | null; videoReferenceItems?: ReferenceVideo[]; audioReferenceItems?: ReferenceAudio[]; taskCountValue?: number; configValue?: AiConfig; modelValue?: string; workflowRef?: WorkflowRef | null } = {}) => {
        if(isOiioiiConfig({...configValue,model:modelValue}))try{videoReferenceItems=withOiiGlobalVideo(configValue,useAssetStore.getState().assets,videoReferenceItems);}catch(error){message.error(error instanceof Error?error.message:"Oii 固定参考不可用");return null;}
        const text = promptText.trim();
        const studio=useVideoStudioStore.getState(),project=studio.projects.find(p=>p.id===studio.activeProjectId);
        const promptContext:VideoTaskCreateOptions["promptContext"]={autoMatch:useWorkbenchLayoutStore.getState().autoMatchReferences,assets:useAssetStore.getState().assets.filter((a):a is Exclude<Asset,{kind:"text"}>=>Boolean(project?.elementIds.includes(a.id))&&a.kind!=="text").map(a=>({id:a.id,title:a.title,kind:a.kind,category:a.category,referenceRule:project?.elementRules?.[a.id]?{...project.elementRules[a.id]}:undefined})),bindings:{...currentBindings.current}};
        const currentNegativePrompt = (negativePromptText ?? configValue.videoNegativePrompt ?? negativePrompt).trim();
        if (workflowRef) {
            if (!token) { message.error("工作流生成需要先登录"); return null; }
            return { text, promptContext, model: modelValue, config: { ...configValue, videoNegativePrompt: currentNegativePrompt }, references: [...referenceItems], firstFrame: firstFrameItem, lastFrame: lastFrameItem, videoReferences: [...videoReferenceItems], audioReferences: [...audioReferenceItems], taskCount: normalizeVideoCount(taskCountValue), workflowRef };
        }
        const klingV26 = isAPIMartKlingV26Config(configValue, modelValue);
        const klingV3 = isKlingV3Config(configValue, modelValue);
        const kling = klingV26 || klingV3;
        const omni = kieKlingOmniVariant(configValue, modelValue);
        const acceptsVideoReferences = omni === "reference-to-video" || omni === "transformation";
        const supportsElements = omni !== "transformation";
        if (!text && !isAutoDLConfig(configValue, modelValue)) {
            message.error("请输入视频提示词");
            return null;
        }
        if (!isAiConfigReady(configValue, modelValue)) {
            message.warning("请先完成配置");
            openConfigDialog(true);
            return null;
        }
        const audioError=seedanceAudioError(modelValue,audioReferenceItems);if(audioError){message.error(audioError);return null;}
        if(isOiioiiConfig({...configValue,model:modelValue}))return {text,promptContext,model:modelValue,config:{...configValue,model:modelValue,videoModel:modelValue},references:[...referenceItems],firstFrame:firstFrameItem,lastFrame:lastFrameItem,videoReferences:[...videoReferenceItems],audioReferences:[...audioReferenceItems],taskCount:1};
        if (kling && omni !== "reference-to-video" && referenceItems.length > (omni === "transformation" ? 4 : 2)) {
            message.error(`Kling 参考图最多 ${omni === "transformation" ? 4 : 2} 张`);
            return null;
        }
        if (omni === "image-to-video" && !referenceItems.length) {
            message.error("请添加首帧图片");
            return null;
        }
        if (omni === "reference-to-video" && !referenceItems.length && !videoReferenceItems.length && !configValue.videoElementList?.some((item) => item.references?.length)) {
            message.error("请添加参考图、参考视频或角色元素");
            return null;
        }
        if (omni === "transformation" && !videoReferenceItems.length) {
            message.error("请添加需要变换的参考视频");
            return null;
        }
        if (klingV26 && boolConfig(configValue.videoGenerateAudio, false)) {
            if (configValue.videoMode !== "pro") {
                message.error("Kling v2.6 音频生成需要 pro 模式");
                return null;
            }
            if (referenceItems.length > 1) {
                message.error("Kling v2.6 开启音频时最多 1 张参考图");
                return null;
            }
        }
        if (klingV3 && supportsElements) {
            const elementError = validateKlingElementList(configValue.videoElementList);
            if (elementError) {
                message.error(elementError);
                return null;
            }
        }
        if (!kling && !isAutoDLConfig(configValue, modelValue) && !isMiniMaxH3Config(configValue, modelValue) && !isAgnesVideoV25Model(modelValue)) {
            const limits = isDreaminaConfig({...configValue,model:modelValue}) ? dreaminaReferenceLimits(configValue,modelValue) : channelProtocolForConfig({ ...configValue, model: modelValue, videoModel: modelValue }) === "ark" && modelKey(modelValue).includes("seedance-2-5") ? ARK_SEEDANCE_REFERENCE_LIMITS : SEEDANCE_REFERENCE_LIMITS;
            const videoReferenceError = seedanceVideoReferenceError(videoReferenceItems, limits);
            if (videoReferenceError) {
                message.error(`${videoReferenceError}。${seedanceVideoReferenceHint}`);
                return null;
            }
        }
        const frameReferencesEnabled = !kling && supportsVideoFrameReferences(modelValue, channelProtocolForConfig({ ...configValue, model: modelValue }));
        const normalizedConfig = buildVideoConfig({ ...configValue, videoNegativePrompt: currentNegativePrompt }, modelValue);
        if (omni === "reference-to-video" && videoReferenceItems.length) normalizedConfig.videoGenerateAudio = "false";
        const imageReferences = omni === "text-to-video" ? [] : omni === "reference-to-video" ? [...referenceItems] : [...referenceItems].slice(0, kling ? omni === "transformation" ? 4 : 2 : referenceItems.length);
        return { text, promptContext, model: modelValue, config: normalizedConfig, references: imageReferences, firstFrame: frameReferencesEnabled ? firstFrameItem : null, lastFrame: frameReferencesEnabled ? lastFrameItem : null, videoReferences: acceptsVideoReferences ? [...videoReferenceItems].slice(0, 1) : kling ? [] : [...videoReferenceItems], audioReferences: kling ? [] : [...audioReferenceItems], taskCount: normalizeVideoCount(taskCountValue) };
    };

    const submitGenerationSnapshot = async (snapshot: { text: string; promptContext?: VideoTaskCreateOptions["promptContext"]; model: string; config: AiConfig; references: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[]; taskCount: number; workflowRef?: WorkflowRef | null }) => {
        const workflowToken = snapshot.workflowRef ? useUserStore.getState().token : "";
        if (enqueueingRef.current) return;
        enqueueingRef.current = true;
        let enqueued = false;
        const active = () => !snapshot.workflowRef || useUserStore.getState().token === workflowToken;
        const destination = useVideoStudioStore.getState();
        const origin=loadedOrigin.current,group=destination.groups.find(g=>g.id===(origin?.groupId||loadedGroup.current)&&g.projectId===(origin?.projectId||destination.activeProjectId));
        const projectId=origin?.projectId||group?.projectId||destination.activeProjectId,folderId=origin?.folderId??group?.folderId??destination.folderId;
        registerProjectReferences([snapshot.firstFrame, ...snapshot.references, snapshot.lastFrame].filter((item): item is ReferenceImage => Boolean(item)), snapshot.videoReferences, snapshot.audioReferences, projectId);
        setRunning(true);
        setPreviewLog(null);
        setNow(Date.now());
        const pendingLogs = Array.from({ length: snapshot.taskCount }, () => {
            const clientTaskId = `client_video_task_${nanoid()}`;
            const task: VideoResponse = { id: clientTaskId, task_id: clientTaskId, model: snapshot.model, status: "queued", progress: 0, created_at: Date.now(), size: snapshot.config.size, seconds: snapshot.config.videoSeconds };
            return buildLog({ prompt: snapshot.text, model: snapshot.model, config: snapshot.config, references: snapshot.references, firstFrame: snapshot.firstFrame, lastFrame: snapshot.lastFrame, videoReferences: snapshot.videoReferences, audioReferences: snapshot.audioReferences, durationMs: 0, status: "生成中", task, taskCount: snapshot.taskCount, lastPolledAt: Date.now(), providerWorkflowRef: snapshot.workflowRef || undefined });
        });
        try {
            await Promise.all(pendingLogs.map((log) => logStore.setItem(log.id, serializeLog(log))));
            useVideoStudioStore.getState().place(pendingLogs.map(log => log.id), { projectId, folderId });
            if(group)useVideoStudioStore.getState().linkGroup(group.id,pendingLogs.map(log=>log.id));
            if (!active()) return;
            setLogs((value) => sortVideoLogs([...pendingLogs, ...value]));
            setResults((value) => sortVideoResults([...pendingLogs.map((log) => createResultFromLog(log, "pending")), ...value]));
            // Only the local enqueue transaction locks the composer. Each request owns its captured snapshot.
            enqueued = true; enqueueingRef.current = false; setRunning(false);
            const settled = await Promise.allSettled(pendingLogs.map((log) => runVideoTask(log, snapshot, workflowToken, active)));
            if (!active()) return;
            const nextLogs = settled
                .map((item) => (item.status === "fulfilled" ? item.value : null))
                .filter((item): item is NonNullable<typeof item> => Boolean(item));
            const storedLogs = await readStoredLogs();
            if (!active()) return;
            setLogs(storedLogs);
            const settledLogs=nextLogs.map(log=>storedLogs.find(stored=>stored.id===log.id)||log);
            const createdCount = settledLogs.filter((item) => item.status === "生成中").length;
            const draftCount=settledLogs.filter(item=>item.task?.preparationOnly&&item.task.status==="awaiting_confirmation").length;
            const failedCount = settledLogs.filter((item) => item.status === "失败").length;
            const uncertainCount=settledLogs.filter(item=>item.status==="待核对"&&!item.task?.preparationOnly).length;
            const failureReason = settledLogs.find(item => item.status === "失败")?.error || "视频任务创建失败";
            if(draftCount)message.success(`已建立 ${draftCount} 个视频节点，请到官网画布手动生成`);
            if (createdCount) message.info(`已提交 ${createdCount} 个视频请求，正在等待生成结果`);
            if (failedCount) message.error(`${failedCount} 个视频任务创建失败：${failureReason}`, 10);
            else if(uncertainCount)message.warning(`${uncertainCount} 个视频任务提交结果待核对，请查看对应卡片；不会自动重发`,10);
            else if (!createdCount&&!draftCount) message.error(failureReason);
        } finally {
            if (!enqueued) { enqueueingRef.current = false; setRunning(false); }
        }
    };

    const runVideoTask = async (pendingLog: GenerationLog, snapshot: { text: string; promptContext?: VideoTaskCreateOptions["promptContext"]; model: string; config: AiConfig; references: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[]; taskCount: number; workflowRef?: WorkflowRef | null }, workflowToken: string, active: () => boolean) => {
        try {
            if (snapshot.workflowRef) {
                if (!workflowToken) throw new Error("工作流生成需要先登录");
                const referenceImages = [snapshot.firstFrame, ...snapshot.references, snapshot.lastFrame].filter((item): item is ReferenceImage => Boolean(item));
                const [workflowImages, workflowVideos, workflowAudios] = await Promise.all([
                    Promise.all(referenceImages.map((item) => workflowMediaSource(item.dataUrl))),
                    Promise.all(snapshot.videoReferences.map((item) => workflowMediaSource(item.url))),
                    Promise.all(snapshot.audioReferences.map((item) => workflowMediaSource(item.url))),
                ]);
                if (!active()) throw new Error("登录状态已变化");
                const submitted = await submitWorkflowTask(workflowToken, {
                    ref: snapshot.workflowRef,
                    expectedCapability: "video",
                    prompt: snapshot.text,
                    systemPrompt: snapshot.config.systemPrompts.video || snapshot.config.systemPrompt,
                    referenceImages: workflowImages,
                    referenceVideos: workflowVideos,
                    referenceAudios: workflowAudios,
                    size: snapshot.config.size,
                    videoSeconds: snapshot.config.videoSeconds,
                    videoQuality: snapshot.config.vquality,
                    videoGenerateAudio: boolConfig(snapshot.config.videoGenerateAudio, false),
                    videoWatermark: boolConfig(snapshot.config.videoWatermark, false),
                    source: "video-workbench",
                    sourceId: pendingLog.id,
                    clientTaskId: pendingLog.task?.id,
                });
                if (!active()) throw new Error("登录状态已变化");
                const task: VideoResponse = { id: submitted.id, task_id: submitted.id, status: submitted.status, progress: submitted.progress, model: snapshot.model, workflowRef: JSON.stringify(snapshot.workflowRef), size: snapshot.config.size, seconds: snapshot.config.videoSeconds };
                const nextLog = { ...pendingLog, task, lastPolledAt: Date.now() };
                await saveGenerationLog(nextLog, active);
                if (!active()) throw new Error("登录状态已变化");
                await persistVideoLog(nextLog);
                if (!active()) throw new Error("登录状态已变化");
                setResults((value) => updateResultByLogId(value, pendingLog.id, { task, progress: task.progress, lastPolledAt: nextLog.lastPolledAt }));
                return nextLog;
            }
            const created = await createVideoGenerationTask(snapshot.config, snapshot.text, { references: snapshot.references, firstFrame: snapshot.firstFrame, lastFrame: snapshot.lastFrame, videoReferences: snapshot.videoReferences, audioReferences: snapshot.audioReferences }, (progress, task) => {
                if(task&&isDreaminaTask(task.id))setLogs(value=>value.map(log=>log.id===pendingLog.id?{...log,task}:log));
                setResults((value) => updateResultByLogId(value, pendingLog.id, { progress,...(task?{task}:{}) }));
            }, { clientTaskId: pendingLog.task?.id, source: "video-workbench", promptContext:snapshot.promptContext, projectKey: placementFor(useVideoStudioStore.getState().placements, pendingLog.id).projectId, onReferencesResolved:async input=>{if(!active())throw Error("当前任务已取消");pendingLog={...pendingLog,references:input.references||[],videoReferences:input.videoReferences||[],audioReferences:input.audioReferences||[]};await saveGenerationLog(pendingLog,active);} });
            const draftOnly=created.task.preparationOnly&&created.task.status==="awaiting_confirmation";
            const uncertain=isDreaminaTask(created.task.id)&&created.task.status==="unknown";
            const rejected=isFailedVideoTask(created.task);
            const nextLog = { ...pendingLog, task: created.task, status:rejected?"失败" as const:uncertain||draftOnly?"待核对" as const:pendingLog.status, error:created.task.error?.message?cleanVideoError(created.task.error.message):undefined, errorDetail:rejected?JSON.stringify(created.task,null,2):undefined, lastPolledAt: Date.now() };
            await saveGenerationLog(nextLog);
            setResults(value=>uncertain||draftOnly?value.filter(item=>item.taskLogId!==pendingLog.id&&item.id!==pendingLog.id):updateResultByLogId(value,pendingLog.id,{status:rejected?"failed":"pending",error:nextLog.error,errorDetail:nextLog.errorDetail,progress:created.task.progress,task:created.task,taskLogId:nextLog.id,lastPolledAt:nextLog.lastPolledAt}));
            return nextLog;
        } catch (error) {
            if (!active()) throw error;
            const durationMs = Date.now() - pendingLog.createdAt;
            const nextLog = { ...pendingLog, ...(isDreaminaConfig(snapshot.config)?{task:{...pendingLog.task!,id:(dreaminaVersionForConfig(snapshot.config)==="canvas"?"dreamina-canvas:":snapshot.config.dreaminaLegacyMode==="agent"?"dreamina-agent:":"dreamina:")+pendingLog.task!.id,status:"unknown"}}:{}), status: "失败" as const, durationMs, lastPolledAt: Date.now(), error: errorMessage(error), errorDetail: errorDetail(error) };
            await saveGenerationLog(nextLog, active);
            if (!active()) throw error;
            await persistVideoLog(nextLog);
            if (!active()) throw error;
            setResults((value) => updateResultByLogId(value, pendingLog.id, { status: "failed", taskLogId: nextLog.id, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs }));
            return nextLog;
        }
    };

    const retryResult = (result: GenerationResult) => {
        if(["local-dreamina","local-dreamina-canvas"].includes(result.config.videoChannelId)){message.warning("即梦原任务已保留，请先核对原任务；如需重做，请使用提示词创建新任务");return;}
        if (result.taskLogId && logs.some(log => log.id === result.taskLogId && log.renderFromDraftTaskId)) {
            message.warning("转成片任务可能已扣费，请先到小云雀核对原任务，避免重复提交");
            return;
        }
        const retryChannelId = videoTaskChannelId(result.task);
        const snapshot = buildRequestSnapshot({ promptText: result.prompt, negativePromptText: result.config.videoNegativePrompt || "", referenceItems: result.references, firstFrameItem: result.firstFrame, lastFrameItem: result.lastFrame, videoReferenceItems: result.videoReferences, audioReferenceItems: result.audioReferences, taskCountValue: 1, configValue: { ...videoConfig, ...result.config, ...(retryChannelId ? { videoChannelId: retryChannelId, activeChannelId: retryChannelId } : {}), model: result.model, videoModel: result.model }, modelValue: result.model, workflowRef: result.providerWorkflowRef || null });
        if (!snapshot) return;
        setResults((value) => value.filter((item) => item.id !== result.id));
        void submitGenerationSnapshot(snapshot);
    };

    const renderDraftLog = async (source: GenerationLog) => {
        if(source.task?.canvasNodeId){message.info("画布样片请在小云雀官网的原视频节点渲染成片");if(source.task.canvasUrl)window.open(source.task.canvasUrl,"_blank","noopener");return;}
        const draftTaskId = source.task?.draftTaskId;
        if (source.status !== "成功" || !source.task?.draft || !draftTaskId || source.draftRenderTaskId || !source.model.endsWith("_draft")) return;
        const clientTaskId = `client_video_task_${nanoid()}`;
        const config = buildResumeVideoConfig(videoConfig, source);
        const pending = buildLog({ prompt: source.prompt, model: source.model, config, references: [], videoReferences: [], audioReferences: [], durationMs: 0, status: "生成中", task: { id: clientTaskId, task_id: clientTaskId, model: source.model, status: "queued", progress: 0, created_at: Date.now() }, taskCount: 1, lastPolledAt: Date.now() });
        pending.title = `${source.title} · 成片`;
        useVideoStudioStore.getState().place([pending.id], { ...placementFor(useVideoStudioStore.getState().placements, source.id), review: "none", trashedAt: undefined });
        pending.renderFromDraftTaskId = draftTaskId;
        const lockedSource = { ...source, draftRenderTaskId: clientTaskId };
        await Promise.all([logStore.setItem(source.id, serializeLog(lockedSource)), logStore.setItem(pending.id, serializeLog(pending))]);
        setLogs(value => sortVideoLogs([lockedSource, pending, ...value.filter(item => item.id !== source.id)]));
        setResults(value => sortVideoResults([createResultFromLog(pending, "pending"), ...value]));
        try {
            const task = await renderPippitDraft(source.model, draftTaskId, clientTaskId);
            const submitted = { ...pending, task, lastPolledAt: Date.now() };
            await saveGenerationLog(submitted);
            setResults(value => updateResultByLogId(value, pending.id, { task, lastPolledAt: submitted.lastPolledAt }));
            message.success("成片任务已提交，样片仍保留");
        } catch (error) {
            const detail = errorMessage(error);
            const failed = { ...pending, status: "失败" as const, error: detail, errorDetail: errorDetail(error) };
            await finalizeGenerationLog(failed);
            setResults(value => updateResultByLogId(value, pending.id, { status: "failed", error: detail }));
            message.error(`${detail}；请核对小云雀原任务，避免重复扣费`);
        }
    };

    const previewGenerationResult = (result: GenerationResult) => {
        setPreviewLog(null);
        setResults((value) => value.filter((item) => item.id !== result.id));
        setPrompt(result.prompt);
        setNegativePrompt(result.config.videoNegativePrompt || "");
        setReferences(result.references || []);
        setFirstFrame(result.firstFrame || null);
        setLastFrame(result.lastFrame || null);
        setVideoReferences(result.videoReferences || []);
        setAudioReferences(result.audioReferences || []);
        updateConfig("videoWorkflowRef", result.providerWorkflowRef);
        const nextModel = result.config.videoModel || result.model;
        const nextChannelId = resolveVideoChannelId(effectiveConfig, nextModel, videoTaskChannelId(result.task), result.config.videoChannelId, result.config.activeChannelId);
        if (nextModel) updateConfig("videoModel", nextModel);
        if (nextChannelId) {
            updateConfig("videoChannelId", nextChannelId);
            updateConfig("activeChannelId", nextChannelId);
        }
        if (result.config.size) updateConfig("videoSize", result.config.size);
        if (result.config.vquality) updateConfig("vquality", result.config.vquality);
        if (result.config.videoSeconds) updateConfig("videoSeconds", result.config.videoSeconds);
        if (result.config.videoMode) updateConfig("videoMode", result.config.videoMode);
        updateConfig("videoMultiShot", result.config.videoMultiShot || "false");
        updateConfig("videoShotType", result.config.videoShotType || "intelligence");
        updateConfig("videoMultiPrompt", normalizeKlingMultiPrompts(result.config.videoMultiPrompt));
        updateConfig("videoElementList", normalizeKlingElementList(result.config.videoElementList));
        updateConfig("videoNegativePrompt", result.config.videoNegativePrompt || "");
        if (result.config.videoGenerateAudio) updateConfig("videoGenerateAudio", result.config.videoGenerateAudio);
        if (result.config.videoWatermark) updateConfig("videoWatermark", result.config.videoWatermark);
        updateConfig("videoCharacterOrientation", normalizeCharacterOrientation(result.config.videoCharacterOrientation));
    };

    const downloadVideo = async (video: GeneratedVideo, logId?: string, title?: string) => {
        const hideLoading = message.loading("正在下载视频...", 0);
        try {
            let targetUrl = await resolveMediaUrl(video.storageKey, video.url).catch(() => video.url || "");
            if ((!targetUrl || targetUrl === video.url) && logId) {
                const { candidates } = await resolveLogVideoCandidates({ id: logId, video });
                if (candidates[0]) targetUrl = candidates[0];
            }
            if (!targetUrl && video.fallbackUrl) targetUrl = video.fallbackUrl;
            const safeName = title ? title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "").slice(0, 60) : "";
            saveAs(await downloadRemoteMedia(targetUrl), `${safeName || "video"}.mp4`);
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频下载失败");
            return false;
        } finally {
            hideLoading();
        }
    };

    const syncVideo = async (video: GeneratedVideo, index = 0) => {
        if (isCloudVideo(video)) return video;
        setSyncingVideoIds((ids) => Array.from(new Set([...ids, video.id])));
        const hideLoading = message.loading("正在同步视频到云端存储...", 0);
        try {
            const uploaded = await uploadRemoteMediaToServer(video.url, `video-${index + 1}.mp4`);
            message.success("视频已同步到云端存储");
            return { ...video, url: uploaded.url, storageKey: uploaded.storageKey, width: uploaded.width || video.width, height: uploaded.height || video.height, bytes: uploaded.bytes || video.bytes, mimeType: uploaded.mimeType || video.mimeType };
        } catch (error) {
            message.error(error instanceof Error ? error.message : "视频同步失败");
            return null;
        } finally {
            hideLoading();
            setSyncingVideoIds((ids) => ids.filter((id) => id !== video.id));
        }
    };

    const syncResultVideo = async (resultId: string, video: GeneratedVideo, index: number) => {
        const synced = await syncVideo(video, index);
        if (!synced) return;
        setResults((value) => updateResult(value, resultId, { video: synced }));
    };

    const syncLogVideo = async (log: GenerationLog, video: GeneratedVideo, index: number) => {
        const synced = await syncVideo(video, index);
        if (!synced) return;
        const nextLog = { ...log, video: synced };
        await logStore.setItem(log.id, serializeLog(nextLog));
        const nextLogs = logs.map((item) => (item.id === log.id ? nextLog : item));
        setLogs(nextLogs);
        await persistVideoLog(nextLog);
        if (previewLog?.id === log.id) setPreviewLog(nextLog);
    };

    const saveResultToAssets = (video: GeneratedVideo, logId?: string) => {
        addAsset({
            kind: "video",
            title: "生成视频",
            coverUrl: "",
            tags: [],
            source: "视频创作台",
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt, ...(logId ? { generationLogId: logId } : {}) },
        });
        message.success("已加入我的素材");
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind !== "text") registerPickedElement(payload);
        const insertImage = async () => {
            if (!referenceImageLimit) {
                message.warning("当前 Kling 模型不支持参考图");
                return;
            }
            if (payload.kind !== "image") {
                message.warning("请选择图片素材");
                return;
            }
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey }].slice(0, referenceImageLimit));
        };
        const insertFrame = (slot: "first" | "last") => {
            if (payload.kind !== "image") {
                message.warning("请选择图片素材");
                return;
            }
            const next = { id: nanoid(), name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey };
            slot === "first" ? setFirstFrame(next) : setLastFrame(next);
        };
        const insertVideo = () => {
            if (isKlingWorkbench && !klingAcceptsVideoReferences) {
                message.warning("当前 Kling 模型不支持参考视频");
                return;
            }
            if (payload.kind !== "video") {
                message.warning("请选择视频素材");
                return;
            }
            setVideoReferences((value) => [...value, { id: nanoid(), name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height, bytes: payload.bytes }].slice(0, videoReferenceLimit));
        };
        const insertAudio = () => {
            if (isKlingWorkbench) {
                message.warning("当前 Kling v2.6 不支持参考音频");
                return;
            }
            if (payload.kind !== "audio") {
                message.warning("请选择音频素材");
                return;
            }
            const picked = [{ id: nanoid(), name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs }];
            const next = autodl ? picked : filterAudioReferencesByDuration(audioReferences, picked, referenceLimits, message.warning);
            setAudioReferences((value) => [...value, ...next].slice(0, referenceLimits.audios));
        };

        if (assetPickerTarget === "element") {
            const next = elementReferenceFromAsset(payload);
            if (!next) {
                message.warning("请选择图片、视频或音频素材");
            } else {
                updateElementReferences(elementPickerIndex, (value) => [...value, next]);
            }
        } else if (assetPickerTarget === "firstFrame") {
            insertFrame("first");
        } else if (assetPickerTarget === "lastFrame") {
            insertFrame("last");
        } else if (assetPickerTarget === "image") {
            await insertImage();
        } else if (assetPickerTarget === "video") {
            insertVideo();
        } else if (assetPickerTarget === "audio") {
            insertAudio();
        } else if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            await insertImage();
        } else if (payload.kind === "video") {
            insertVideo();
        } else if (payload.kind === "audio") {
            insertAudio();
        }
        setAssetPickerOpen(false);
    };

    const elementReferenceFromAsset = (payload: InsertAssetPayload): VideoElementReference | null => {
        if (payload.kind === "image") return { id: nanoid(), kind: "image", name: payload.title, type: payload.mimeType || "image/*", dataUrl: payload.dataUrl, storageKey: payload.storageKey, bytes: payload.bytes, width: payload.width, height: payload.height };
        if (payload.kind === "video") return { id: nanoid(), kind: "video", name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey, bytes: payload.bytes, width: payload.width, height: payload.height };
        if (payload.kind === "audio") return { id: nanoid(), kind: "audio", name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs };
        return null;
    };

    const registerElement = (asset: Parameters<typeof addAsset>[0], projectId = useVideoStudioStore.getState().activeProjectId) => {
        const allAssets = useAssetStore.getState().assets;
        const project = useVideoStudioStore.getState().projects.find(item => item.id === projectId);
        const existing = reusableProjectElement(allAssets, asset, project?.elementIds || [], project?.elementRules);
        const id = existing?.id || addAsset(asset);
        useVideoStudioStore.getState().addElement(id, projectId);
    };
    const registerProjectReferences = (images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], projectId = useVideoStudioStore.getState().activeProjectId) => {
        for (const image of images) registerElement({ kind: "image", title: image.name, coverUrl: image.dataUrl, tags: [], data: { dataUrl: image.dataUrl, storageKey: image.storageKey, width: 0, height: 0, bytes: 0, mimeType: image.type }, source: "视频项目参考" }, projectId);
        for (const item of videos) registerElement({ kind: "video", title: item.name, coverUrl: "", tags: [], data: { url: item.url, storageKey: item.storageKey, width: item.width || 0, height: item.height || 0, bytes: item.bytes || 0, mimeType: item.type }, source: "视频项目参考" }, projectId);
        for (const item of audios) registerElement({ kind: "audio", title: item.name, coverUrl: "", tags: [], data: { url: item.url, storageKey: item.storageKey, durationMs: item.durationMs, mimeType: item.type }, source: "视频项目参考" }, projectId);
    };
    const registerPickedElement = (payload: InsertAssetPayload) => {
        if (payload.kind === "image") registerProjectReferences([{ id: nanoid(), name: payload.title, type: payload.mimeType || "image/png", dataUrl: payload.dataUrl, storageKey: payload.storageKey }], [], []);
        else if (payload.kind === "video") registerProjectReferences([], [{ id: nanoid(), name: payload.title, type: payload.mimeType || "video/mp4", url: payload.url, storageKey: payload.storageKey }], []);
        else if (payload.kind === "audio") registerProjectReferences([], [], [{ id: nanoid(), name: payload.title, type: payload.mimeType || "audio/mpeg", url: payload.url, storageKey: payload.storageKey, durationMs: payload.durationMs }]);
    };
    const currentRefs = useRef({images:references,audio:audioReferences,video:videoReferences}); currentRefs.current={images:references,audio:audioReferences,video:videoReferences};
    useEffect(() => {
        if (typeof window === "undefined") return;
        const extractLocalId = (rawUrl?: string) => /\/workbench\/local-media\/([a-f0-9]{48})(?:[?#]|$)/.exec(rawUrl || "")?.[1] || "";
        const onHealed = (ev: Event) => {
            const detail = (ev as CustomEvent<{ urlByLocalId?: Record<string, string>; replacedAssetId?:string }>).detail;
            const urlMap = detail?.urlByLocalId;
            if (!urlMap || !Object.keys(urlMap).length) return;
            const assetLocalMap = new Map(useAssetStore.getState().assets.flatMap(a => (a.localFile?.id ? [[a.id, a.localFile.id] as const] : [])));
            const nextUrlFor = (assetId?: string, rawUrl?: string) => {
                const lid = detail?.replacedAssetId ? (assetId && assetLocalMap.get(assetId)) || extractLocalId(rawUrl) : extractLocalId(rawUrl) || (assetId && assetLocalMap.get(assetId));
                return lid ? urlMap[lid] : undefined;
            };
            setReferences(prev => {
                let changed = false;
                const next = prev.map(r => {
                    if(detail?.replacedAssetId&&r.assetId&&r.assetId!==detail.replacedAssetId)return r;
                    const u = nextUrlFor(r.assetId, r.dataUrl);
                    if (!u || u === r.dataUrl) return r;
                    changed = true;
                    return { ...r, dataUrl: u,...(detail?.replacedAssetId&&(!r.assetId||r.assetId===detail.replacedAssetId)?{storageKey:undefined}:{}) };
                });
                return changed ? next : prev;
            });
            setAudioReferences(prev => {
                let changed = false;
                const next = prev.map(r => {
                    const u = nextUrlFor(r.assetId, r.url);
                    if (!u || u === r.url) return r;
                    changed = true;
                    return { ...r, url: u };
                });
                return changed ? next : prev;
            });
            setVideoReferences(prev => {
                let changed = false;
                const next = prev.map(r => {
                    const u = nextUrlFor(r.assetId, r.url);
                    if (!u || u === r.url) return r;
                    changed = true;
                    return { ...r, url: u };
                });
                return changed ? next : prev;
            });
            setFirstFrame(prev => {
                if (!prev) return prev;
                const u = nextUrlFor(undefined, prev.dataUrl);
                return u && u !== prev.dataUrl ? { ...prev, dataUrl: u } : prev;
            });
            setLastFrame(prev => {
                if (!prev) return prev;
                const u = nextUrlFor(undefined, prev.dataUrl);
                return u && u !== prev.dataUrl ? { ...prev, dataUrl: u } : prev;
            });
        };
        window.addEventListener("workbench:local-assets-healed", onHealed);
        let lastFocusSync = 0;
        const syncActiveProjectLocals = () => {
            if (!window.desktopBridge?.localAssetSync) return;
            const now = Date.now();
            if (now - lastFocusSync < 1500) return;
            lastFocusSync = now;
            const proj = useVideoStudioStore.getState().projects.find(p => p.id === projectId);
            const idSet = new Set(proj?.elementIds || []);
            const target = useAssetStore.getState().assets.filter(a => idSet.has(a.id) && a.localFile);
            if (target.length > 0) void syncLocalAssets(target).catch(() => {});
        };
        const kickoff = window.setTimeout(syncActiveProjectLocals, 250);
        window.addEventListener("focus", syncActiveProjectLocals);
        return () => {
            window.clearTimeout(kickoff);
            window.removeEventListener("workbench:local-assets-healed", onHealed);
            window.removeEventListener("focus", syncActiveProjectLocals);
        };
    }, [projectId]);
    const useProjectElement = async (asset: Asset, mention = true): Promise<boolean> => {
        if(mention){const selected=Object.fromEntries(Object.entries(currentBindings.current).filter(([key,value])=>!key.startsWith("omit:")||value!==asset.id));delete selected["omit:"+asset.kind+":"+asset.title.normalize("NFKC").trim()];if(Object.keys(selected).length!==Object.keys(currentBindings.current).length){currentBindings.current=selected;setReferenceBindings(selected);}if(loadedGroup.current)useVideoStudioStore.setState(s=>({groups:s.groups.map(g=>g.id===loadedGroup.current?{...g,bindings:selected}:g)}));}
        const revision=composerRevision.current;
        const isPreserved=Boolean(currentBindings.current["preserve:asset:"+asset.id]||currentRefs.current.images.some(r=>r.assetId===asset.id)||currentRefs.current.audio.some(r=>r.assetId===asset.id)||currentRefs.current.video.some(r=>r.assetId===asset.id));
        if(!isPreserved&&useVideoStudioStore.getState().projects.find(p=>p.id===projectId)?.elementRules?.[asset.id]?.disabled){message.info("此元素已禁用，请先在元素库启用");return false;}
        const insertMention=()=>setPrompt(value=>value.includes(`@${asset.title}`)?value:`${value}${value?" ":""}@${asset.title} `);
        try { asset = await refreshLocalAsset(asset); } catch(error) { useAssetStore.getState().updateAsset(asset.id,{metadata:{...asset.metadata,localFileMissing:true}});message.error(error instanceof Error ? error.message : '原文件失效，请重新定位'); return false; }
        if(revision!==composerRevision.current||currentBindings.current["omit:asset:"+asset.id])return false;
        if (asset.kind === "image") {
            const existing=currentRefs.current.images.findIndex(r=>r.assetId===asset.id||Boolean(asset.localFile&&r.dataUrl?.split('?')[0]===asset.data.dataUrl.split('?')[0]));
            if(existing>=0){currentRefs.current.images=currentRefs.current.images.map((r,i)=>i===existing?{...r,assetId:asset.id,name:asset.title,type:asset.data.mimeType,dataUrl:asset.data.dataUrl,storageKey:asset.data.storageKey}:r);setReferences(currentRefs.current.images);if(mention)insertMention();return true;}
            if(currentRefs.current.images.some(r=>r.name===asset.title&&(r.storageKey?r.storageKey===asset.data.storageKey:r.dataUrl===asset.data.dataUrl))){if(mention)insertMention();return true;}
            if (!referenceImageLimit || currentRefs.current.images.length >= referenceImageLimit) { message.warning("当前模型的参考图片名额已满"); return false; }
            currentRefs.current.images=[...currentRefs.current.images,{id:nanoid(),assetId:asset.id,name:asset.title,type:asset.data.mimeType,dataUrl:asset.data.dataUrl,storageKey:asset.data.storageKey}];setReferences(currentRefs.current.images);
        } else if (asset.kind === "audio") {
            const existing=currentRefs.current.audio.findIndex(r=>r.assetId===asset.id||Boolean(r.storageKey&&r.storageKey===asset.data.storageKey)||Boolean(!r.storageKey&&r.url?.split('?')[0]===asset.data.url.split('?')[0]));
            if(existing>=0){currentRefs.current.audio=currentRefs.current.audio.map((r,i)=>i===existing?{...r,assetId:asset.id,name:asset.title,type:asset.data.mimeType,url:asset.data.url,storageKey:asset.data.storageKey,durationMs:asset.data.durationMs}:r);setAudioReferences(currentRefs.current.audio);if(mention)insertMention();return true;}
            if(currentRefs.current.audio.some(r=>r.name===asset.title&&(r.storageKey?r.storageKey===asset.data.storageKey:r.url===asset.data.url))){if(mention)insertMention();return true;}
            if (isKlingWorkbench || currentRefs.current.audio.length >= referenceLimits.audios) { message.warning("当前模型不支持更多参考音频"); return false; }
            const picked = [{ id: nanoid(), assetId:asset.id, name: asset.title, type: asset.data.mimeType, url: asset.data.url, storageKey: asset.data.storageKey, durationMs: asset.data.durationMs }];
            const accepted = autodl ? picked : filterAudioReferencesByDuration(currentRefs.current.audio, picked, referenceLimits, message.warning);
            if (!accepted.length) return false;
            currentRefs.current.audio=[...currentRefs.current.audio,...accepted];setAudioReferences(currentRefs.current.audio);
        } else if (asset.kind === "video") {
            if ((isKlingWorkbench && !klingAcceptsVideoReferences) || currentRefs.current.video.length >= videoReferenceLimit) { message.warning("当前模型不支持更多参考视频"); return false; }
            if(currentRefs.current.video.some(r=>r.url===asset.data.url)){if(mention)insertMention();return true;}
            currentRefs.current.video=[...currentRefs.current.video,{id:nanoid(),assetId:asset.id,name:asset.title,type:asset.data.mimeType,url:asset.data.url,storageKey:asset.data.storageKey}];setVideoReferences(currentRefs.current.video);
        } else { setPrompt(asset.data.content); return false; }
        useVideoStudioStore.getState().addElement(asset.id,projectId);
        if(mention)setPrompt(value => value.includes(`@${asset.title}`) ? value : `${value}${value ? " " : ""}@${asset.title} `);
        if(mention)message.success("参考素材已加入当前提示词");
        return true;
    };
    const bindPromptReference=async(asset:Asset,name=asset.title,kind="any",replacement?:{id:string;kind:string}|null)=>{
        if(kind!=="any"&&kind!==asset.kind){message.warning("图片、视频和音频需分别绑定");return false;}
        const revision=composerRevision.current;
        const selected=Object.fromEntries(Object.entries(currentBindings.current).filter(([key,value])=>!key.startsWith("omit:")||value!==asset.id));
        delete selected["omit:"+kind+":"+name.normalize("NFKC").trim()];delete selected["omit:"+asset.kind+":"+name.normalize("NFKC").trim()];if(Object.keys(selected).length!==Object.keys(currentBindings.current).length){currentBindings.current=selected;setReferenceBindings(selected);}
        const previous=currentRefs.current;
        const updateCards=()=>{setReferences(currentRefs.current.images);setAudioReferences(currentRefs.current.audio);setVideoReferences(currentRefs.current.video);};
        if(replacement&&replacement.kind===asset.kind){
            const key=asset.kind==="image"?"images":asset.kind==="audio"?"audio":"video",prior=currentRefs.current[key].find(r=>r.id===replacement.id);
            if(prior&&!assetsForReference(useAssetStore.getState().assets,prior,asset.kind).some(a=>a.id===asset.id)){currentRefs.current={...currentRefs.current,[key]:currentRefs.current[key].filter(r=>r.id!==replacement.id)};updateCards();}
        }
        if(!await useProjectElement(asset,false)||revision!==composerRevision.current){if(revision===composerRevision.current){currentRefs.current=previous;updateCards();}return false;}
        const key=kind+":"+name.normalize("NFKC").trim();
        const next={...currentBindings.current,["manual:"+key]:asset.id,["manual:"+asset.kind+":"+name.normalize("NFKC").trim()]:asset.id,[key]:asset.id,[asset.kind+":"+name.normalize("NFKC").trim()]:asset.id,["any:"+asset.title.normalize("NFKC").trim()]:asset.id};currentBindings.current=next;setReferenceBindings(next);
        const draft={referenceBindings:next,prompt,negativePrompt,references:currentRefs.current.images,firstFrame,lastFrame,videoReferences:currentRefs.current.video,audioReferences:currentRefs.current.audio,matchIssues:[],taskCount,loadedGroup:loadedGroup.current,loadedOrigin:loadedOrigin.current};
        draftRef.current={id:projectId,draft};
        // Commit the chosen binding and its references together before closing the picker.
        await useVideoStudioStore.setState(s=>({drafts:{...s.drafts,[projectId]:draft},groups:s.groups.map(g=>g.id===loadedGroup.current?{...g,bindings:next}:g)}));
        return revision===composerRevision.current;
    };
    const replaceComposerReference=async(item:ReferenceImage,assetId:string,slot?:'first'|'last')=>{
      const state=useVideoStudioStore.getState(),project=state.projects.find(p=>p.id===projectId),found=useAssetStore.getState().assets.find(a=>a.id===assetId&&a.kind==='image'&&project?.elementIds.includes(a.id));
      if(!found||found.kind!=='image')throw Error('请拖入当前项目的图片');if(project?.elementRules?.[assetId]?.disabled)throw Error('请先启用这张图片');const revision=composerRevision.current,asset=await refreshLocalAsset(found);if(revision!==composerRevision.current||asset.kind!=='image')return;
      const next={id:item.id,assetId:asset.id,name:asset.title,type:asset.data.mimeType,dataUrl:asset.data.dataUrl,storageKey:asset.data.storageKey};
      if(slot){slot==='first'?setFirstFrame(next):setLastFrame(next);return;}
      if(!currentRefs.current.images.some(r=>r.id===item.id))return;
      const all=useAssetStore.getState().assets,prior=assetsForReference(all,item,'image'),bindings=replacePromptReferenceBindings(prompt,projectReferenceAssets(all.filter(a=>project?.elementIds.includes(a.id)),project?.elementRules),currentBindings.current,prior.map(a=>a.id),asset);
      delete bindings['omit:asset:'+asset.id];currentBindings.current=bindings;setReferenceBindings(bindings);
      currentRefs.current={...currentRefs.current,images:currentRefs.current.images.map(r=>r.id===item.id?next:r)};setReferences(currentRefs.current.images);
      if(loadedGroup.current)useVideoStudioStore.setState(s=>({groups:s.groups.map(g=>g.id===loadedGroup.current?{...g,bindings}:g)}));
    };
    const currentBoundNames=()=>[...currentRefs.current.images.map(r=>"image:"+r.name),...currentRefs.current.audio.map(r=>"audio:"+r.name),...currentRefs.current.video.map(r=>"video:"+r.name)];
    const fillCandidates=fillAsset?missingPromptReferences(matchPromptAssets(prompt,projectReferenceAssets(useAssetStore.getState().assets.filter(a=>useVideoStudioStore.getState().projects.find(p=>p.id===projectId)?.elementIds.includes(a.id)),useVideoStudioStore.getState().projects.find(p=>p.id===projectId)?.elementRules),referenceBindings),currentBoundNames()).filter(i=>i.kind===fillAsset.kind||i.kind==="any"):[];
    const offerAssetFill=(asset:Asset)=>{
        const project=useVideoStudioStore.getState().projects.find(p=>p.id===projectId);
        const report=matchPromptAssets(prompt,projectReferenceAssets(useAssetStore.getState().assets.filter(a=>project?.elementIds.includes(a.id)),project?.elementRules),referenceBindings);
        if(!project?.elementRules?.[asset.id]?.disabled&&missingPromptReferences(report,currentBoundNames()).some(i=>i.kind===asset.kind||i.kind==="any"))setFillAsset(asset);else void useProjectElement(asset);
    };
    const autoMatchPrompt = async (value: string, selected=currentBindings.current, readDuration=true, replace=false) => {
        if(referenceUploadsRef.current&&!replace)return;
        const source=value;value=repairPromptMentions(value);if(source!==value)setPrompt(previous=>previous===source?value:previous);
        const seconds=readDuration?promptDuration(value):null;if(seconds!==null)updateVideoConfig("videoSeconds",String(seconds));
        const state=useVideoStudioStore.getState(),project=state.projects.find(p=>p.id===state.activeProjectId);
        const projectAssets=projectReferenceAssets(useAssetStore.getState().assets.filter(asset=>project?.elementIds.includes(asset.id)),project?.elementRules);
        const report=matchPromptAssets(value,projectAssets,selected),{matches,ambiguous,missing}=report;
        if(replace||Object.keys(project?.elementRules||{}).length){
            const keep=(r:{assetId?:string;name:string;storageKey?:string;dataUrl?:string;url?:string},kind:string)=>{const found=assetsForReference(projectAssets,r,kind);if(replace)return found.some(a=>matches.some(m=>m.id===a.id)||Boolean(selected["preserve:asset:"+a.id]));if(!found.length)return true;if(found.some(a=>Boolean(selected["preserve:asset:"+a.id])))return true;if(!r.assetId&&found.length>1&&found.some(a=>a.referenceRule?.disabled))return false;return found.some(a=>!a.referenceRule?.disabled&&(matches.some(m=>m.id===a.id)||!report.bindings.some(b=>b.kind===kind&&nameMatchesAsset(a.referenceRule?.name||a.title,b.name))));};
            currentRefs.current={images:currentRefs.current.images.filter(r=>keep(r,"image")),audio:currentRefs.current.audio.filter(r=>keep(r,"audio")),video:currentRefs.current.video.filter(r=>keep(r,"video"))};
            setReferences(currentRefs.current.images);setAudioReferences(currentRefs.current.audio);setVideoReferences(currentRefs.current.video);
        }
        referenceUploadsRef.current++;setReferencesUploading(true);
        const failed:string[]=[],revision=composerRevision.current;
        try {
            for(const asset of matches){if(revision!==composerRevision.current)return;if(currentBindings.current["omit:asset:"+asset.id])continue;if(!await useProjectElement(asset,false))failed.push(asset.title);}
            if(revision!==composerRevision.current)return;
            setMatchIssues([...missing,...ambiguous.map(name=>name+"（同名，请手动选）"),...failed.map(name=>name+"（未加入）")]);
            if(ambiguous.length)message.warning("同名素材请用 @ 手动选择："+ambiguous.join("、"));
        }finally{referenceUploadsRef.current--;if(!referenceUploadsRef.current)setReferencesUploading(false);}
    };
    const [composerDragging,setComposerDragging]=useState(false);
    useEffect(()=>{const clear=()=>setComposerDragging(false);window.addEventListener('drop',clear,true);window.addEventListener('dragend',clear,true);window.addEventListener('blur',clear);return()=>{window.removeEventListener('drop',clear,true);window.removeEventListener('dragend',clear,true);window.removeEventListener('blur',clear);};},[]);
    const dropReferences=async(files:File[],assetId:string)=>{
        const revision=composerRevision.current,sourceProject=projectId;
        if(referenceUploadsRef.current){message.info("素材正在处理，请稍后再拖入");return;}
        referenceUploadsRef.current++;setReferencesUploading(true);
        try{
            const ids=assetId?[assetId]:await importLocalElements(sourceProject,files);
            let added=0;
            for(const id of ids){
                if(revision!==composerRevision.current||sourceProject!==useVideoStudioStore.getState().activeProjectId)return;
                const asset=useAssetStore.getState().assets.find(a=>a.id===id);
                if(asset&&await bindPromptReference(asset,asset.title,asset.kind)){useVideoStudioStore.getState().addElement(id,sourceProject);added++;}
            }
            if(added)message.success("已加入 "+added+" 个参考素材"+(window.desktopBridge?.isDesktop?"，保留原文件位置":""));
        }catch(error){message.error(error instanceof Error?error.message:"添加参考素材失败");}
        finally{referenceUploadsRef.current--;if(!referenceUploadsRef.current)setReferencesUploading(false);}
    };
    const reviewDrafts=useRef(new Map<string,any>());
    const navigateVideoGroup=async(group:StudioVideoGroup)=>{
        if(loadedGroup.current===group.id){reviewDrafts.current.delete(projectId+':'+group.id);await loadVideoGroup(group);return;}
        if(loadedGroup.current)reviewDrafts.current.set(projectId+':'+loadedGroup.current,{prompt,negativePrompt,references:currentRefs.current.images,audioReferences:currentRefs.current.audio,videoReferences:currentRefs.current.video,firstFrame,lastFrame,bindings:currentBindings.current,taskCount});
        const draft=reviewDrafts.current.get(projectId+':'+group.id);
        if(!draft){await loadVideoGroup(group);return;}
        createSession();loadedGroup.current=group.id;loadedOrigin.current={groupId:group.id,projectId:group.projectId,folderId:group.folderId};currentRefs.current={images:draft.references,audio:draft.audioReferences,video:draft.videoReferences};currentBindings.current=draft.bindings;setPrompt(draft.prompt);setNegativePrompt(draft.negativePrompt);setReferences(draft.references);setAudioReferences(draft.audioReferences);setVideoReferences(draft.videoReferences);setFirstFrame(draft.firstFrame);setLastFrame(draft.lastFrame);setReferenceBindings(draft.bindings);setTaskCount(draft.taskCount);setFocusSceneRevision(n=>n+1);const seconds=promptDuration(draft.prompt);if(seconds!==null)updateVideoConfig('videoSeconds',String(seconds));
    };
    const loadVideoGroup=async(group:StudioVideoGroup)=>{
        createSession();currentRefs.current={images:[],audio:[],video:[]};loadedGroup.current=group.id;loadedOrigin.current={groupId:group.id,projectId:group.projectId,folderId:group.folderId};
        setPrompt(group.prompt);setTaskCount(1);setFocusSceneRevision(value=>value+1);
        const selected=Object.fromEntries(Object.entries(group.bindings||{}).filter(([key])=>!key.startsWith("omit:")));currentBindings.current=selected;setReferenceBindings(selected);
        const seconds=promptDuration(group.prompt);if(seconds!==null)updateVideoConfig("videoSeconds",String(seconds));
        if(useWorkbenchLayoutStore.getState().autoMatchReferences)await autoMatchPrompt(group.prompt,selected,true,true);
    };
    const clearComposer = () => {
        composerRevision.current++;currentRefs.current={images:[],audio:[],video:[]};
        loadedGroup.current="";loadedOrigin.current=null;currentBindings.current={};setReferenceBindings({});setMatchIssues([]);
        setPrompt("");setNegativePrompt("");updateConfig("videoNegativePrompt","");
        setReferences([]);setFirstFrame(null);setLastFrame(null);setVideoReferences([]);setAudioReferences([]);
        updateConfig("videoElementList",defaultKlingElementList());
    };
    const createSession = () => {
        clearComposer();
        setResults([]);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const selectedLogs = logs.filter((log) => selectedLogIds.includes(log.id));
        const deleteKeys = new Set(selectedLogs.flatMap(videoLogDeleteKeys));
        const deletedLogs = logs.filter((log) => selectedLogIds.includes(log.id) || videoLogDeleteKeys(log).some((key) => deleteKeys.has(key)));
        const nextLogs = logs.filter((log) => !deletedLogs.some((deleted) => deleted.id === log.id));
        const keys = disposableLogStorageKeys(deletedLogs, nextLogs, [firstFrame, lastFrame, ...references].filter((item): item is ReferenceImage => Boolean(item)), [...videoReferences, ...audioReferences], results);
        setLogs(nextLogs);
        logsRef.current = nextLogs;
        setResults((value) => value.filter((item) => !selectedLogIds.includes(item.id) && !selectedLogIds.includes(item.taskLogId || "") && !videoResultIdentityKeys(item).some((key) => deleteKeys.has(key))));
        void Promise.all([deleteBackendVideoTasks(deletedLogs), deleteAccountVideoLogs(deletedLogs), deleteStoredMedia(keys.media), deleteStoredImages(keys.images), ...deletedLogs.map((log) => logStore.removeItem(log.id))]).catch(() => undefined);
        if (previewLog && deletedLogs.some((log) => log.id === previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const deleteBackendVideoTasks = async (items: GenerationLog[]) => {
        const config = effectiveConfigRef.current;
        if (!token || !usesBackendVideoTasks(config)) return;
        await Promise.all(items.filter((item) => item.task && !isLocalClientVideoTask(item.task)).map((item) => deleteVideoGenerationTask(config, item.task).catch(() => undefined)));
    };

    const deleteAccountVideoLogs = async (items: GenerationLog[]) => {
        if (!token) return;
        const ids = Array.from(new Set(items.flatMap(videoLogDeleteKeys)));
        if (!ids.length) return;
        await deleteVideoGenerationLogs(token, ids).catch(() => undefined);
    };

    const refreshLogs = async () => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        return nextLogs;
    };

    const syncBackendVideoTasks = async (baseLogs?: GenerationLog[]) => {
        const config = effectiveConfigRef.current;
        if (!token || !usesBackendVideoTasks(config)) return baseLogs || logsRef.current;
        try {
            const tasks = await listVideoGenerationTasks(config);
            const recoverableTasks = tasks.filter(isRecoverableBackendVideoTask);
            if (!recoverableTasks.length) return baseLogs || logsRef.current;
            const currentLogs = baseLogs || (await readStoredLogs());
            const mergedLogs = mergeBackendVideoTasks(currentLogs, recoverableTasks, config);
            const taskKeys = new Set(recoverableTasks.flatMap(videoTaskIdentityKeys));
            const recoveredLogs = mergedLogs.filter((log) => videoLogIdentityKeys(log).some((key) => taskKeys.has(key)));
            await persistStoredVideoLogs(recoveredLogs);
            setLogs(mergedLogs);
            setResults((value) => mergePendingLogResults(value, mergedLogs.filter((log) => log.status === "生成中" && log.task && !log.video)));
            return mergedLogs;
        } catch {
            return baseLogs || logsRef.current;
        }
    };

    const loadAccountVideoHistory = async () => {
        try {
            const localLogs = await readStoredLogs();
            const remoteLogs = await fetchVideoGenerationLogs<GenerationLog>(token);
            const mergedLogs = await mergeVideoLogs(remoteLogs, localLogs);
            await replaceStoredVideoHistory(mergedLogs);
            setLogs(mergedLogs);
            return mergedLogs;
        } catch {
            // Keep local video history available when account sync fails.
            return undefined;
        }
    };

    const persistVideoLog = async (log: GenerationLog) => {
        if (!token || !shouldSyncVideoLog(log)) return;
        const previous=logsRef.current.find(item=>item.id===log.id);if(previous?.interruptedAt&&log.interruptedAt===undefined)log=log.video?{...log,interruptedAt:0}:{...log,interruptedAt:previous.interruptedAt,status:"待核对",error:previous.error};
        await saveVideoGenerationLogs(token, [serializeLog(log)]).catch(() => undefined);
    };

    const saveGenerationLog = async (log: GenerationLog, active: () => boolean = () => true) => {
        if (!active()) return;
        const previous=logsRef.current.find(item=>item.id===log.id);
        if(previous?.interruptedAt&&log.interruptedAt===undefined)log=log.video?{...log,interruptedAt:0}:{...log,interruptedAt:previous.interruptedAt,status:"待核对",error:previous.error};
        await logStore.setItem(log.id, serializeLog(log));
        if (!active()) return;
        setLogs((value) => sortVideoLogs([log, ...value.filter((item) => item.id !== log.id)]));
    };

    const finalizeGenerationLog = async (log: GenerationLog, active: () => boolean = () => true) => {
        if(!active())return;
        const previous=await logStore.getItem<GenerationLog>(log.id);
        if(!active())return;
        const notify=shouldNotifyVideoCompletion(log,previous,notifiedVideoIdsRef.current);
        const notifyFailure=shouldNotifyVideoFailure(log,previous,notifiedFailureIdsRef.current);
        if(notifyFailure)log={...log,failureNotifiedAt:Date.now()};
        else if(previous?.failureNotifiedAt)log={...log,failureNotifiedAt:previous.failureNotifiedAt};
        if(notify)log={...log,completionNotifiedAt:Date.now()};
        else if(previous?.completionNotifiedAt)log={...log,completionNotifiedAt:previous.completionNotifiedAt};
        await saveGenerationLog(log, active);
        if(active()&&notifyFailure)message.error({key:"video-failure:"+(log.task?.id||log.id),content:"视频生成失败："+cleanVideoError(log.error||"生成失败"),duration:10});
        if(active()&&notify){
            const group=useVideoStudioStore.getState().groups.find(g=>g.logIds.includes(log.id));
            const title='视频 '+studioVideoNumber(log,1,group)+' 生成成功';
            message.success(title,5);
            void window.desktopBridge?.videoCompletionNotice?.({id:log.id,title,projectId:placementFor(useVideoStudioStore.getState().placements,log.id).projectId}).catch(()=>undefined);
        }
        if (!active()) return;
        const nextLogs = await readStoredLogs();
        if (!active()) return;
        setLogs(nextLogs);
        await persistVideoLog(log);
        if(log.status==="成功" && log.video && log.task?.id?.startsWith("pippit:") && !log.task.canvasNodeId && window.desktopBridge?.pippitCanvasSync)void autoSyncPippitCanvas(log).then(report=>{if(report.failed)message.warning("视频已生成，画布同步失败："+report.errors[0]?.error);}).catch(error=>message.warning("视频已生成，画布同步失败："+errorMessage(error)));
        if(log.video && window.desktopBridge?.videoStudioSync)void archiveStudioVideo(log).catch(error=>message.error("视频已缓存，但保存到项目文件夹失败："+errorMessage(error)));
    };

    const pollPendingLogOnce = async (log: GenerationLog, resumeConfig: AiConfig, context: WorkflowPollContext) => {
        const active = () => !context.signal.aborted && !log.interruptedAt&&!interruptedLogIdsRef.current.has(log.id) && (!log.providerWorkflowRef || useUserStore.getState().token === context.token);
        if (!active()) return;
        pollingLogIdsRef.current.add(log.id);
        const startedAt = log.createdAt || Date.now();
        try {
            const workflowTask = log.providerWorkflowRef ? await getWorkflowTask(context.token, videoLogTaskId(log), context.signal) : null;
            if (!active()) return;
            const workflowURL = workflowTask?.urls?.[0] || "";
            const task = workflowTask ? { ...log.task!, status: workflowTask.status, progress: workflowTask.progress, video_url: workflowURL, url: workflowURL, storageKey: comfyOutputStorageKey(workflowURL) || undefined, error: workflowTask.error ? { message: workflowTask.error } : undefined } : await pollVideoGenerationTaskStatus(resumeConfig, log.task!);
            if (!active()) return;
            const durationMs = Date.now() - startedAt;
            const baseLog = { ...log, task:{...task,...(log.task?.preparationOnly?{preparationOnly:true}:{})}, status:"生成中" as const, error:undefined, errorDetail:undefined, durationMs, lastPolledAt: Date.now() };
            if(task.status==="awaiting_interpolation"){await saveGenerationLog(baseLog,active);return;}
            if(log.task?.preparationOnly&&task.status==="awaiting_confirmation"){await saveGenerationLog({...baseLog,status:"待核对"},active);return;}
            if(isDreaminaTask(task.id)&&task.status==="unknown"){if(task.error?.message?.includes("本地已停止等待")){await saveGenerationLog({...baseLog,interruptedAt:Date.now(),status:"待核对",error:"本地等待已中断；官网任务未确认取消，可恢复查询"},active);if(active()){interruptedLogIdsRef.current.add(log.id);setResults(value=>value.filter(item=>item.taskLogId!==log.id&&item.id!==log.id));}return;}await saveGenerationLog({...baseLog,status:"待核对",error:task.error?.message||"提交结果待核对，请检查原画布任务"},active);if(active())setResults(value=>value.filter(item=>item.taskLogId!==log.id&&item.id!==log.id));return;}
            if (isFailedVideoTask(task)) {
                const nextLog = { ...baseLog, status: "失败" as const, error: cleanVideoError(task.error?.message || "视频生成失败"), errorDetail: errorDetail(new VideoRequestError(task.error?.message || "视频生成失败", task)) };

                await finalizeGenerationLog(nextLog, active);
                if (!active()) return;
                setResults((value) => updateResultByLogId(value, log.id, { status: "failed", task, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                return;
            }
            if (isCompletedVideoTask(task)) {
                if(task.remoteOnly&&task.canvasUrl){const nextLog={...baseLog,status:"成功" as const,error:undefined,errorDetail:undefined};await finalizeGenerationLog(nextLog,active);if(active())setResults(value=>value.filter(item=>item.taskLogId!==log.id&&item.id!==log.id));return;}
                if (!task.video_url && !task.url) {
                    const nextLog = { ...baseLog, status: "失败" as const, error: "视频生成完成但没有返回视频地址", errorDetail: errorDetail(new VideoRequestError("视频生成完成但没有返回视频地址", task)) };
                    await finalizeGenerationLog(nextLog, active);
                    if (!active()) return;
                    setResults((value) => updateResultByLogId(value, log.id, { status: "failed", task, error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                    return;
                }
                const workflowVideo = workflowTask && !comfyOutputStorageKey(task.video_url || task.url || "") ? await downloadRemoteMedia(task.video_url || task.url || "") : null;
                if (!active()) return;
                const uploaded = workflowVideo ? await uploadMediaFile(workflowVideo, "workflow-video", undefined, context.token) : null;
                if (!active()) return;
                const video = uploaded ? { ...videoFromTaskResponse(task, durationMs), url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, width: uploaded.width || 1280, height: uploaded.height || 720 } : videoFromTaskResponse(task, durationMs);
                const nextLog = { ...baseLog, status: "成功" as const, video, error: undefined, errorDetail: undefined };
                await finalizeGenerationLog(nextLog, active);
                if (!active()) return;
                setResults((value) => value.filter((item) => item.taskLogId !== log.id && item.id !== log.id));
                return;
            }
            await saveGenerationLog(baseLog, active);
            if (!active()) return;
            setResults((value) => updateResultByLogId(value, log.id, { task, progress: task.progress, durationMs, lastPolledAt: baseLog.lastPolledAt }));
        } catch (error) {
            if (!active() || error instanceof Error && error.name === "AbortError") return;
            const nextLog = { ...log, durationMs: Date.now() - startedAt, lastPolledAt: Date.now(), error: errorMessage(error), errorDetail: errorDetail(error) };
            if(isDreaminaTask(log.task?.id)){await saveGenerationLog({...nextLog,status:"待核对"},active);if(active())setResults(value=>value.filter(item=>item.taskLogId!==log.id&&item.id!==log.id));return;}
            if (isTransientVideoPollError(error)) {
                await saveGenerationLog({ ...nextLog, status: "生成中" }, active);
                if (!active()) return;
                setResults((value) => updateResultByLogId(value, log.id, { error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
                return;
            }
            await finalizeGenerationLog({ ...nextLog, status: "失败" }, active);
            if (!active()) return;
            setResults((value) => updateResultByLogId(value, log.id, { status: "failed", error: nextLog.error, errorDetail: nextLog.errorDetail, durationMs: nextLog.durationMs, lastPolledAt: nextLog.lastPolledAt }));
        } finally {
            pollingLogIdsRef.current.delete(log.id);
        }
    };

    const previewGenerationLog = async (record: GenerationLog) => {
        clearComposer();
        const revision=composerRevision.current,sourceProject=projectId,groupId=useVideoStudioStore.getState().groups.find(g=>g.logIds.includes(record.id))?.id || "";
        const log = await normalizeLog(record, true);
        if(revision!==composerRevision.current||sourceProject!==useVideoStudioStore.getState().activeProjectId)return;
        loadedGroup.current=groupId;const origin=placementFor(useVideoStudioStore.getState().placements,record.id);loadedOrigin.current={groupId,projectId:origin.projectId,folderId:origin.folderId};
        currentRefs.current={images:log.references||[],audio:log.audioReferences||[],video:log.videoReferences||[]};
        registerProjectReferences([log.firstFrame, ...log.references, log.lastFrame].filter((item): item is ReferenceImage => Boolean(item)), log.videoReferences, log.audioReferences, placementFor(useVideoStudioStore.getState().placements, log.id).projectId);
        setPreviewLog(log);
        setPrompt(log.prompt);
        const project=useVideoStudioStore.getState().projects.find(p=>p.id===projectId),all=projectReferenceAssets(useAssetStore.getState().assets.filter(a=>project?.elementIds.includes(a.id)),project?.elementRules);
        const resolveRefAsset=<R extends {assetId?:string;name:string;storageKey?:string;dataUrl?:string;url?:string}>(r:R,kind:string)=>{const c=assetsForReference(all,r,kind),hit=c.find(a=>a.id===r.assetId)||c.find(a=>a.title===r.name)||(c.length===1?c[0]:undefined);return hit&&hit.id!==r.assetId?{...r,assetId:hit.id}:r;};
        const resolvedImages=(log.references||[]).map(r=>resolveRefAsset(r,'image')),resolvedAudio=(log.audioReferences||[]).map(r=>resolveRefAsset(r,'audio')),resolvedVideo=(log.videoReferences||[]).map(r=>resolveRefAsset(r,'video'));
        currentRefs.current={images:resolvedImages,audio:resolvedAudio,video:resolvedVideo};
        const selected=restorePromptBindings(log.prompt,all,[...resolvedImages.map(r=>({...r,kind:'image'})),...resolvedAudio.map(r=>({...r,kind:'audio'})),...resolvedVideo.map(r=>({...r,kind:'video'}))],useVideoStudioStore.getState().groups.find(g=>g.id===loadedGroup.current)?.bindings);
        currentBindings.current=selected;setReferenceBindings(selected);
        setFocusSceneRevision(value=>value+1);
        setNegativePrompt(log.config.videoNegativePrompt || "");
        setReferences(resolvedImages);
        setFirstFrame(log.firstFrame || null);
        setLastFrame(log.lastFrame || null);
        setVideoReferences(resolvedVideo);
        setAudioReferences(resolvedAudio);
        updateConfig("videoWorkflowRef", log.providerWorkflowRef);
        const nextModel = log.config.videoModel || log.model;
        const nextChannelId = resolveVideoChannelId(effectiveConfig, nextModel, videoTaskChannelId(log.task), log.config.videoChannelId, log.config.activeChannelId);
        if (nextModel) updateConfig("videoModel", nextModel);
        if (nextChannelId) {
            const dreamina=nextChannelId.startsWith('local-dreamina'),store=useConfigStore.getState(),prefs={videoModel:nextModel,videoSize:log.config.size,vquality:log.config.vquality,videoSeconds:log.config.videoSeconds};
            updateConfig('videoStudioProvider',dreamina?'dreamina':undefined);
            if(dreamina){const legacy=nextChannelId==='local-dreamina';updateConfig('dreaminaVersion',legacy?'legacy':'canvas');updateConfig(legacy?'dreaminaPreferences':'dreaminaCanvasPreferences',prefs);}
            else {store.setGenerationProvider(nextChannelId==='local-pippit'?'pippit':'other');if(nextChannelId==='local-pippit')updateConfig('pippitPreferences',prefs);else{updateConfig('otherVideoChannelId',nextChannelId);updateConfig('otherChannelPage',nextChannelId==='local-oiioii'?'oiioii':'general');if(nextChannelId==='local-oiioii')updateConfig('oiioiiPreferences',prefs);}}
            updateConfig("videoChannelId", nextChannelId);
            updateConfig("activeChannelId", nextChannelId);
        }
        if (log.config.size) updateConfig("videoSize", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if(nextChannelId==="local-dreamina-canvas")updateConfig("dreaminaInterpolationFps",log.config.dreaminaInterpolationFps??(log.task?.returnMode==="original"?0:log.task?.interpolatedFps||30));
        if (log.config.videoMode) updateConfig("videoMode", log.config.videoMode);
        updateConfig("videoMultiShot", log.config.videoMultiShot || "false");
        updateConfig("videoShotType", log.config.videoShotType || "intelligence");
        updateConfig("videoMultiPrompt", normalizeKlingMultiPrompts(log.config.videoMultiPrompt));
        updateConfig("videoNegativePrompt", log.config.videoNegativePrompt || "");
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        updateConfig("videoCharacterOrientation", normalizeCharacterOrientation(log.config.videoCharacterOrientation));
    };

    const retryGenerationLog = async (record: GenerationLog) => {
        if(["local-dreamina","local-dreamina-canvas"].includes(record.config.videoChannelId)){message.warning("即梦原任务已保留，请先核对原任务；如需重做，请使用提示词创建新任务");return;}
        const log = await normalizeLog(record, true);
        if (log.renderFromDraftTaskId) {
            message.warning("转成片任务可能已扣费，请先到小云雀核对原任务，避免重复提交");
            return;
        }
        const retryChannelId = videoTaskChannelId(log.task);
        const snapshot = buildRequestSnapshot({ promptText: log.prompt, negativePromptText: log.config.videoNegativePrompt || "", referenceItems: log.references || [], firstFrameItem: log.firstFrame || null, lastFrameItem: log.lastFrame || null, videoReferenceItems: log.videoReferences || [], audioReferenceItems: log.audioReferences || [], taskCountValue: 1, configValue: { ...videoConfig, ...log.config, ...(retryChannelId ? { videoChannelId: retryChannelId, activeChannelId: retryChannelId } : {}), model: log.model, videoModel: log.model }, modelValue: log.model, workflowRef: log.providerWorkflowRef || null });
        if (!snapshot) return;
        void submitGenerationSnapshot(snapshot);
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <VideoStudio agentParams={{seconds:videoConfig.videoSeconds,size:videoConfig.size,resolution:videoConfig.vquality,model}} onApplyAgentResult={payload=>{setPrompt(payload.prompt);if(useWorkbenchLayoutStore.getState().autoMatchReferences)autoMatchPrompt(payload.prompt,currentBindings.current,true,false);if(payload.params?.seconds)updateVideoConfig("videoSeconds",String(payload.params.seconds).replace(/[^\d]/g,""));if(payload.params?.size)updateVideoConfig("size",payload.params.size);if(payload.params?.resolution)updateVideoConfig("vquality",payload.params.resolution.toLowerCase());if(payload.params?.model)updateVideoConfig("videoModel",payload.params.model);if(payload.autoStart)setTimeout(()=>{document.querySelector<HTMLButtonElement>('[data-composer-floating] button.ant-btn-primary')?.click();},120);}} onResumeDraft={async log=>{if(log.interruptedAt){interruptedLogIdsRef.current.delete(log.id);await saveGenerationLog({...log,interruptedAt:0,status:"生成中",error:undefined,errorDetail:undefined,lastPolledAt:0});message.info("已恢复原任务查询，不会重新生成");return;}try{const task=await resumeDreaminaDraft(log.task!.id,log.prompt);if(["processing","unknown","completed"].includes(task.status||""))await saveGenerationLog({...log,task,status:task.status==="unknown"?"待核对":"生成中",error:task.error?.message,errorDetail:undefined,lastPolledAt:Date.now()});else message.info("原画布草稿已保留");}catch(error){message.error(errorMessage(error));}}} onStopLog={async log=>{modal.confirm({title:"中断当前视频的本地等待？",content:"停止工作台查询和转圈，保留原任务及素材。已发送到官网的生成不保证取消，可到官网核对；恢复查询不会重新生成。",okText:"中断等待",cancelText:"继续等待",onOk:async()=>{interruptedLogIdsRef.current.add(log.id);const next={...log,interruptedAt:Date.now(),status:"待核对" as const,error:"本地等待已中断；官网任务未确认取消，可恢复查询",lastPolledAt:Date.now()};logsRef.current=logsRef.current.map(item=>item.id===log.id?next:item);await saveGenerationLog(next);setResults(value=>value.filter(item=>item.taskLogId!==log.id&&item.id!==log.id));message.info("已中断本地等待，原任务已保留");}});}} key={projectId+":"+studioReady} onLoadGroup={loadVideoGroup} onEditLog={previewGenerationLog} logs={logs} running={running || referencesUploading} onReset={createSession} onUploadReferences={() => fileInputRef.current?.click()} onPickAsset={() => openAssetPicker()} onUseAsset={offerAssetFill} onDownload={downloadVideo}
                renderDetail={(record) => <ResolvedGenerationLog log={record}>{log=><HistoryLogCard log={log} index={0} selected={false} showSelection={false} active={false} syncing={Boolean(log.video && syncingVideoIds.includes(log.video.id))} onSelectedChange={() => {}} onDelete={() => useVideoStudioStore.getState().place([log.id], { trashedAt: Date.now() })} onPreview={() => previewGenerationLog(log)} onRetry={() => retryGenerationLog(log)} onRenderDraft={() => void renderDraftLog(log)} onCopyPrompt={(value) => void copyPrompt(value, (content) => message.success(content))} onDownload={(v) => void downloadVideo(v, log.id, log.title)} onSync={(video) => void syncLogVideo(log, video, 0)} onSaveAsset={(v) => saveResultToAssets(v, log.id)} />}</ResolvedGenerationLog>}
                composer={onHidePrompt=><div data-composer-drop-zone className={"w-full max-w-6xl "+(composerDragging?"rounded-3xl outline-2 outline-dashed outline-primary":"")} onDragOver={event=>{if(event.dataTransfer.types.includes("Files")||event.dataTransfer.types.includes("application/x-video-element")){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="link";setComposerDragging(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setComposerDragging(false);}} onDrop={event=>{const assetId=event.dataTransfer.getData("application/x-video-element"),files=Array.from(event.dataTransfer.files);if(!assetId&&!files.length)return;event.preventDefault();event.stopPropagation();setComposerDragging(false);void dropReferences(files,assetId);}}><WorkbenchPanel
                            loadedGroupId={loadedGroup.current} onNavigateGroup={navigateVideoGroup} onHidePrompt={onHidePrompt} focusSceneRevision={focusSceneRevision}
                            layout="bottom"
                            currentLayout="bottom"
                            prompt={prompt}
                            negativePrompt={negativePrompt}
                            references={references}
                            firstFrame={firstFrame}
                            lastFrame={lastFrame}
                            videoReferences={videoReferences}
                            audioReferences={audioReferences}
                            config={videoConfig}
                            model={model}
                            canGenerate={canGenerate}
                            running={running || referencesUploading}
                            pendingCount={pendingCount}
                            taskCount={taskCount}
                            onTaskCountChange={setTaskCount}
                            updateConfig={updateVideoConfig}
                            openConfigDialog={openConfigDialog}
                            onLayoutChange={() => setBottomSettingsCollapsed(value => !value)}
                            onPromptChange={setPrompt}
                            onNegativePromptChange={(value) => { setNegativePrompt(value); updateConfig("videoNegativePrompt", value); }}
                            onOpenPromptLibrary={() => setPromptDialogOpen(true)}
                            onOpenAssetPicker={openAssetPicker}
                             onRestoreReferences={state=>{loadedGroup.current=state.loadedGroup||"";const originGroup=useVideoStudioStore.getState().groups.find(g=>g.id===loadedGroup.current);loadedOrigin.current=originGroup?{groupId:originGroup.id,projectId:originGroup.projectId,folderId:originGroup.folderId}:null;setNegativePrompt(state.negativePrompt||"");updateConfig("videoNegativePrompt",state.negativePrompt||"");composerRevision.current++;currentRefs.current={images:state.references,audio:state.audioReferences,video:state.videoReferences};currentBindings.current=state.bindings;setReferences(state.references);setAudioReferences(state.audioReferences);setVideoReferences(state.videoReferences);setFirstFrame(state.firstFrame);setLastFrame(state.lastFrame);setReferenceBindings(state.bindings);}} referenceBindings={referenceBindings} onBindReference={bindPromptReference} onMatchPrompt={value=>autoMatchPrompt(value,currentBindings.current,true,true)} onOpenBinding={(name,kind,replacement)=>{openAssetPicker();setBindingTarget({name,kind});setBindingReplacement(replacement||null);}}
                            onPastePrompt={() => void pastePromptFromClipboard()}
                            onClearPrompt={clearComposer}
                            onPasteReferences={() => void addReferencesFromClipboard()}
                            onPasteFrame={(slot) => void setFrameFromClipboard(slot)}
                            onPasteVideoReferences={() => void addVideoReferencesFromClipboard()}
                            onPasteAudioReferences={() => void addAudioReferencesFromClipboard()}
                            onUploadReferences={() => fileInputRef.current?.click()}
                            onUploadImageReferences={() => imageInputRef.current?.click()}
                            onUploadAudioReferences={() => audioInputRef.current?.click()}
                            onUploadVideoReferences={() => videoInputRef.current?.click()}
                            onUploadFrame={(slot) => (slot === "first" ? firstFrameInputRef.current?.click() : lastFrameInputRef.current?.click())}
                            onRemoveFrame={(slot) => void removeFrameReference(slot)}
                            onReplaceReference={replaceComposerReference}
                            onRemoveReference={(id) => void removeReference(id)}
                            onMoveReference={(index, offset) => setReferences((value) => moveListItem(value, index, offset))}
                            onRemoveVideoReference={(id) => void removeVideoReference(id)}
                            onMoveVideoReference={(index, offset) => setVideoReferences((value) => moveListItem(value, index, offset))}
                            onRemoveAudioReference={(id) => void removeAudioReference(id)}
                            onMoveAudioReference={(index, offset) => setAudioReferences((value) => moveListItem(value, index, offset))}
                            onGenerate={() => void generate()}
                            bottomSettingsCollapsed={bottomSettingsCollapsed}
                            setBottomSettingsCollapsed={setBottomSettingsCollapsed}
                        /></div>}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept={isKlingWorkbench ? (klingAcceptsVideoReferences ? "image/*,video/mp4,video/quicktime" : "image/*") : "image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"}
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" multiple className="hidden" aria-label="上传视频参考图" onChange={(event) => { void addReferences(event.target.files); event.target.value = ""; }} />
            <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav" multiple className="hidden" aria-label="上传视频参考音频" onChange={(event) => { void addReferences(event.target.files); event.target.value = ""; }} />
            <input ref={videoInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple className="hidden" aria-label="上传视频参考视频" onChange={(event) => { void addReferences(event.target.files); event.target.value = ""; }} />
            <input
                ref={elementFileInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addElementReferences(elementUploadIndex, event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={firstFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void uploadFrameReference("first", event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={lastFrameInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void uploadFrameReference("last", event.target.files);
                    event.target.value = "";
                }}
            />
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            {assetPickerTarget === "general" ? <VideoReferencePicker key={bindingTarget?bindingTarget.kind+":"+bindingTarget.name:"general"} open={assetPickerOpen} logs={logs} groupId={loadedGroup.current} prompt={prompt} referenceBindings={referenceBindings} referenceUrls={[...references.map(r=>r.dataUrl),...audioReferences.map(r=>r.url),...videoReferences.map(r=>r.url)]} referenceNames={[...references.map(r=>"image:"+r.name),...audioReferences.map(r=>"audio:"+r.name),...videoReferences.map(r=>"video:"+r.name)]} bindingTarget={bindingTarget} onChooseTarget={(name,kind)=>{setBindingReplacement(null);setBindingTarget({name,kind});}} onSelect={async asset=>{const imageOrAudio=asset.kind==="image"||asset.kind==="audio";const accepted=bindingTarget?await bindPromptReference(asset,bindingTarget.name,bindingTarget.kind,bindingReplacement):imageOrAudio?await bindPromptReference(asset):await useProjectElement(asset);if(accepted){if(!bindingTarget&&imageOrAudio){setPrompt(value=>value.includes("@"+asset.title)?value:value+(value?" ":"")+"@"+asset.title+" ");message.success("参考素材已加入当前提示词");}setAssetPickerOpen(false);}}} onClose={()=>{setAssetPickerOpen(false);setBindingReplacement(null);}} /> : <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />}
            <Modal title={"填补缺失引用 · "+(fillAsset?.title||"")} open={Boolean(fillAsset)} onCancel={()=>setFillAsset(null)} footer={<Button onClick={()=>{if(fillAsset)void useProjectElement(fillAsset);setFillAsset(null);}}>仅添加为参考素材</Button>}>
                <p className="mb-3 text-sm text-muted-foreground">选择要填补的空缺，仅替换这一组的引用，不改提示词原文。</p>
                <div className="grid gap-2">{fillCandidates.map(i=><Button key={i.kind+":"+i.name} aria-label={"用所选素材填补 "+i.name} onClick={async()=>{if(fillAsset&&await bindPromptReference(fillAsset,i.name,i.kind)){setFillAsset(null);message.success("已填补「"+i.name+"」");}}}>填补「{i.name}」</Button>)}</div>
            </Modal>
            <Modal title="删除生成记录" open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
                确定删除选中的 {selectedLogIds.length} 条生成记录吗？
            </Modal>
        </div>
    );
}

function WorkbenchPanel({
    loadedGroupId,
    focusSceneRevision,
    layout,
    currentLayout,
    prompt,
    negativePrompt = "",
    references,
    firstFrame,
    lastFrame,
    videoReferences,
    audioReferences,
    config,
    model,
    canGenerate,
    running,
    pendingCount,
    taskCount,
    onTaskCountChange,
    updateConfig,
    openConfigDialog,
    onLayoutChange,
    onPromptChange,
    onNegativePromptChange,
    onOpenPromptLibrary,
    onOpenAssetPicker,
    onBindReference, onMatchPrompt, referenceBindings, onOpenBinding, onRestoreReferences,
    onPastePrompt,
    onClearPrompt,
    onPasteReferences,
    onPasteFrame,
    onPasteVideoReferences,
    onPasteAudioReferences,
    onUploadReferences,
    onUploadImageReferences,
    onUploadAudioReferences,
    onUploadVideoReferences,
    onUploadFrame,
    onRemoveFrame,
    onReplaceReference,
    onRemoveReference,
    onMoveReference,
    onRemoveVideoReference,
    onMoveVideoReference,
    onRemoveAudioReference,
    onMoveAudioReference,
    onGenerate,
    bottomSettingsCollapsed = true,
    setBottomSettingsCollapsed,
    onHidePrompt,
    onNavigateGroup,
}: {
    loadedGroupId?:string;onNavigateGroup?:(group:StudioVideoGroup)=>Promise<void>;onHidePrompt?:()=>void; focusSceneRevision?:number;onRestoreReferences:(state:ComposerReferenceState)=>void;
    layout: WorkbenchLayout;
    currentLayout: WorkbenchLayout;
    prompt: string;
    negativePrompt?: string;
    references: ReferenceImage[];
    firstFrame: ReferenceImage | null;
    lastFrame: ReferenceImage | null;
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    config: AiConfig;
    model: string;
    canGenerate: boolean;
    running: boolean;
    pendingCount: number;
    taskCount: number;
    onTaskCountChange: (value: number) => void;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    onLayoutChange: (layout: WorkbenchLayout) => void;
    onPromptChange: (value: string) => void;
    onNegativePromptChange?: (value: string) => void;
    onOpenPromptLibrary: () => void;
    onOpenAssetPicker: (target?: AssetPickerTarget) => void;
    referenceBindings:Record<string,string>;
    onOpenBinding:(name:string,kind:string,replacement?:{id:string;kind:string})=>void;
    onBindReference: (asset: Asset,name?:string,kind?:string) => Promise<boolean>; onMatchPrompt: (value: string) => Promise<void>;
    onPastePrompt: () => void;
    onClearPrompt: () => void;
    onPasteReferences: () => void;
    onPasteFrame: (slot: "first" | "last") => void;
    onPasteVideoReferences: () => void;
    onPasteAudioReferences: () => void;
    onUploadReferences: () => void;
    onUploadImageReferences?: () => void;
    onUploadAudioReferences?: () => void;
    onUploadVideoReferences?: () => void;
    onUploadFrame: (slot: "first" | "last") => void;
    onRemoveFrame: (slot: "first" | "last") => void;
    onReplaceReference:(item:ReferenceImage,assetId:string,slot?:"first"|"last")=>Promise<void>;
    onRemoveReference: (id: string) => void;
    onMoveReference: (index: number, offset: number) => void;
    onRemoveVideoReference: (id: string) => void;
    onMoveVideoReference: (index: number, offset: number) => void;
    onRemoveAudioReference: (id: string) => void;
    onMoveAudioReference: (index: number, offset: number) => void;
    onGenerate: () => void;
    bottomSettingsCollapsed?: boolean;
    setBottomSettingsCollapsed?: (value: boolean) => void;
}) {
    const {message}=App.useApp();
        const matchAutomatically=async(value:string)=>{if(useWorkbenchLayoutStore.getState().autoMatchReferences)await onMatchPrompt(value);};
    const assets=useAssetStore(s=>s.assets);
    const mediaReferences=[...references.map(r=>({kind:"image",assetId:r.assetId,name:r.name,url:r.dataUrl,storageKey:r.storageKey})),...audioReferences.map(r=>({kind:"audio",assetId:r.assetId,name:r.name,url:r.url,storageKey:r.storageKey})),...videoReferences.map(r=>({kind:"video",assetId:r.assetId,name:r.name,url:r.url,storageKey:r.storageKey}))];
    const referencedAssets=mediaReferences.flatMap(r=>{const baseUrl=r.url?.split("?")[0]||"";const hits=assets.filter(a=>a.kind===r.kind&&(r.assetId===a.id||(a.localFile&&baseUrl.endsWith("/workbench/local-media/"+a.localFile.id))||(a.kind==="image"?Boolean(r.storageKey&&r.storageKey===a.data.storageKey)||(r.url===a.data.dataUrl||(Boolean(baseUrl)&&baseUrl===(a.data.dataUrl?.split("?")[0]||""))):(a.kind==="audio"||a.kind==="video")?Boolean(r.storageKey&&r.storageKey===a.data.storageKey)||(r.url===a.data.url||(Boolean(baseUrl)&&baseUrl===(a.data.url?.split("?")[0]||""))):false)));const named=hits.filter(a=>a.title===r.name);return named.length?named:hits.length===1?hits:[];});
    const boundNames=[...mediaReferences.map(r=>r.kind+":"+r.name),...referencedAssets.map(a=>a.kind+":"+a.title)];
    const projects=useVideoStudioStore(s=>s.projects),activeProjectId=useVideoStudioStore(s=>s.activeProjectId),project=projects.find(p=>p.id===activeProjectId);
    const projectAssets=useMemo(()=>{const ids=new Set(project?.elementIds);return projectReferenceAssets(assets.filter(a=>ids.has(a.id)),project?.elementRules);},[assets,project?.elementIds,project?.elementRules]);
    const report=useMemo(()=>matchPromptAssets(prompt,projectAssets,referenceBindings),[prompt,projectAssets,referenceBindings]);
    const hasMissing=report.issues.length>0||report.matches.some(a=>a.metadata?.localFileMissing||!boundNames.includes(a.kind+":"+a.title));
    const frameReferencesEnabled = Boolean(config.videoWorkflowRef) || supportsVideoFrameReferences(model, channelProtocolForConfig({ ...config, model }));
    const referenceLimits = withSeedanceAudioBudget(model,isOiioiiConfig({...config,model}) ? oiioiiReferenceLimits(config,model) : isDreaminaConfig({...config,model}) ? dreaminaReferenceLimits(config,model) : !config.videoWorkflowRef && channelProtocolForConfig({ ...config, model, videoModel: model }) === "ark" && modelKey(model).includes("seedance-2-5") ? ARK_SEEDANCE_REFERENCE_LIMITS : SEEDANCE_REFERENCE_LIMITS);
    const autodl = !config.videoWorkflowRef && isAutoDLConfig(config, model);
    const { data: autodlWorkflow } = useAutoDLWorkflow(config, model);
    const cogVideoX3 = !config.videoWorkflowRef && isCogVideoX3Model(model);
    const audioGenerationEnabled = supportsVideoAudioGeneration(model, channelProtocolForConfig({ ...config, model, videoModel: model }));
    const generateAudio = boolConfig(config.videoGenerateAudio, false);
    const klingBottomConfig = config.videoWorkflowRef ? null : resolveKlingWorkbenchConfig(config, model);
    const klingBottomVariant = klingBottomConfig?.variant || "";
    const klingBottomProvider = klingBottomConfig?.provider || "apimart";
    const klingBottom = Boolean(klingBottomConfig);
    const dreaminaBottom = isDreaminaConfig({...config,model,videoModel:model});
    const oiioiiBottom=isOiioiiConfig({...config,model,videoModel:model});
    const pippitChannel=isPippitConfig({ ...config, model, videoModel: model });
    const composerReferenceState=useMemo(()=>({references,audioReferences,videoReferences,firstFrame,lastFrame,bindings:referenceBindings,loadedGroup:loadedGroupId,negativePrompt}),[references,audioReferences,videoReferences,firstFrame,lastFrame,referenceBindings,loadedGroupId,negativePrompt]);
    const pippitBottom = true;
    const [composerWidth, setComposerWidth] = useState(1120);
    const [promptHeight, setPromptHeight] = useState(80);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
    const showAudioSwitch = klingBottom || audioGenerationEnabled;
    const motionControl = !config.videoWorkflowRef && (isAPIMartKlingMotionControlConfig(config, model) || isKIEKlingMotionControlConfig(config, model));
    const bottomSettingsGridClass = motionControl
        ? showAudioSwitch ? "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.8fr_0.7fr_auto_auto]" : "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.7fr_auto_auto]"
        : showAudioSwitch ? "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.8fr_0.7fr_auto_auto]" : "lg:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.7fr_auto_auto]";
    const initializedKlingV3BottomSecondsRef = useRef(false);

    useEffect(() => {
        if (klingBottomVariant !== "v3" || initializedKlingV3BottomSecondsRef.current) return;
        initializedKlingV3BottomSecondsRef.current = true;
        if (String(config.videoSeconds || "").trim() === "6") updateConfig("videoSeconds", "3");
    }, [config.videoSeconds, klingBottomVariant, updateConfig]);

    if (layout === "bottom") {
        return (
            <div className="flex w-full min-w-0 justify-center px-3 pb-3 pt-2">
                <div data-video-composer className={`pointer-events-auto w-full rounded-[24px] bg-card/90 p-4 shadow-[0_32px_100px_rgba(15,23,42,.22),0_10px_34px_rgba(15,23,42,.10)] ring-1 ring-white/50 backdrop-blur-2xl dark:ring-white/10 dark:shadow-[0_34px_110px_rgba(0,0,0,.58)] ${pippitBottom ? "overflow-y-auto" : "max-w-5xl"}`} style={{width:pippitBottom?composerWidth:undefined,maxWidth:"100%",maxHeight:"calc(100vh - 64px)",overflowY:"auto"}}>
                    <div className="flex flex-col gap-2">
                        {pippitBottom && (references.length||videoReferences.length||audioReferences.length||firstFrame||lastFrame||hasMissing) ? <PippitComposerAssets onReplaceImage={onReplaceReference} trailing={<PromptMissingAssets prompt={prompt} bindings={referenceBindings} boundNames={boundNames} onOpenBind={onOpenBinding} onBindAsset={onBindReference}/>} hideUploadActions onBindCard={(item,kind,index)=>{const target=referenceCardTarget(prompt,report.bindings,projectAssets,item,kind,index);onOpenBinding(target.name,kind,{id:item.id,kind});}} onLocateCard={(item,kind,index)=>{const target=referenceCardTarget(prompt,report.bindings,projectAssets,item,kind,index),editor=document.querySelector<HTMLElement>('[data-video-studio] [data-video-composer] [data-prompt-reference-editor]');if(editor&&target.start>=0)locatePromptRange(editor,target.start,target.end);else message.info("提示词中没有此素材名称，可先绑定到人物、场景或声音声明");}} references={references} videoReferences={videoReferences} audioReferences={audioReferences} firstFrame={firstFrame} lastFrame={lastFrame} onUploadImages={onUploadImageReferences || onUploadReferences} onUploadAudio={onUploadAudioReferences || onUploadReferences} onUploadVideo={onUploadVideoReferences || onUploadReferences} onOpenAssetPicker={onOpenAssetPicker} onRemoveImage={onRemoveReference} onRemoveVideo={onRemoveVideoReference} onRemoveAudio={onRemoveAudioReference} onRemoveFrame={onRemoveFrame} /> : null}
                        {!pippitBottom&&<div className="flex gap-2 overflow-x-auto"><PromptMissingAssets prompt={prompt} bindings={referenceBindings} boundNames={boundNames} onOpenBind={onOpenBinding} onBindAsset={onBindReference}/></div>}
                        <div className={pippitBottom ? "relative" : "grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"}>
                            <PromptReferenceInput key={focusSceneRevision} referenceState={composerReferenceState} onRestoreReferences={onRestoreReferences} focusSceneRevision={focusSceneRevision}
                                value={prompt}
                                bindings={referenceBindings} boundNames={boundNames} onChange={onPromptChange} onBind={onBindReference} onMatch={matchAutomatically}
                                aria-label="视频提示词"
                                placeholder={pippitBottom ? "请描述你想制作的视频，可结合上方图片和音频作为参考" : "描述镜头运动、主体动作、场景氛围和画面风格"}
                                autoSize={undefined}
                                style={{height:pippitBottom?promptHeight:120,minHeight:80,maxHeight:"calc(100vh - 260px)",overflowY:"auto"}}
                                className={`rounded-2xl ${pippitBottom ? "!resize-none" : ""}`}
                                onPressEnter={(event) => {
                                    if (!event.shiftKey && canGenerate) onGenerate();
                                }}
                            />
                            {pippitBottom ? <button type="button" aria-label="拖动调整提示词区宽度和高度" title="向右拖动加宽，向上拖动加高，向下拖动缩小；双击恢复默认大小" onDoubleClick={()=>{setComposerWidth(1120);setPromptHeight(80);}} className="absolute right-2 top-2 z-10 flex size-8 touch-none items-center justify-center rounded-lg bg-stone-100/80 text-stone-500 hover:bg-accent hover:text-primary dark:bg-stone-800/80" onPointerDown={(event) => { event.preventDefault();resizeStartRef.current = { x: event.clientX, y: event.clientY, width: event.currentTarget.closest("[data-video-composer]")!.getBoundingClientRect().width, height: Math.min(window.innerHeight-260, event.currentTarget.parentElement!.querySelector("[data-prompt-reference-editor]")!.getBoundingClientRect().height) }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { const start = resizeStartRef.current; if (!start) return; setComposerWidth(Math.max(360, Math.min(window.innerWidth - 32, start.width + event.clientX - start.x))); setPromptHeight(Math.max(80, Math.min(window.innerHeight - 260, start.height + start.y - event.clientY))); }} onPointerUp={() => { resizeStartRef.current = null; }} onPointerCancel={() => { resizeStartRef.current = null; }} onLostPointerCapture={() => { resizeStartRef.current = null; }}><Grip className="size-4" /></button> : null}
                            <div className={`flex shrink-0 flex-wrap items-center justify-end gap-2 ${pippitBottom ? "hidden" : ""}`}>
                                <Button title="清空输入" icon={<Trash2 className="size-4" />} onClick={onClearPrompt} />
                                <Button title="提示词库" icon={<BookOpen className="size-4" />} onClick={onOpenPromptLibrary} />
                                <Button title="我的素材" icon={<FolderPlus className="size-4" />} onClick={() => onOpenAssetPicker()} />
                                <Button title="参数配置" className={`lg:hidden ${!bottomSettingsCollapsed ? "!border-sky-500/30 !bg-sky-500/10 !text-sky-500" : ""}`} icon={<SlidersHorizontal className="size-4" />} onClick={() => setBottomSettingsCollapsed?.(!bottomSettingsCollapsed)} />
                                <Button title="更多视频参数" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)} />
                                <Button type="primary" className="h-9 rounded-xl px-4 font-medium lg:!hidden" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                    {pendingCount ? `开始创作 · ${pendingCount} 进行中` : "开始创作"}
                                </Button>
                            </div>
                        </div>
                        {klingBottom && klingBottomProvider !== "kie" ? (
                            <Input.TextArea
                                value={negativePrompt}
                                onChange={(event) => onNegativePromptChange?.(event.target.value)}
                                placeholder="负面提示词"
                                autoSize={{ minRows: 1, maxRows: 3 }}
                                className="rounded-2xl"
                            />
                        ) : null}
                        {config.generationProvider === "pippit" ? <div className="flex flex-wrap items-center gap-2 text-xs"><PippitCreditIndicator /><span className="opacity-60">· 积分样片版</span></div> : null}
                        {pippitBottom ? <div data-video-generation-toolbar className="flex items-center gap-2"><div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [&>*]:shrink-0">
                            <div className="flex gap-1">
                                <Button aria-label="@ 引用素材" title="@ 引用素材" type="text" onClick={()=>onOpenAssetPicker()}>@</Button>
                            </div>
                            {oiioiiBottom?<OiioiiVideoParameters config={config} onChange={updateConfig}/>:pippitChannel?<DreaminaVideoParameters provider="pippit" config={config} onChange={updateConfig}/>:dreaminaBottom ? <DreaminaVideoParameters config={config} onChange={updateConfig} interpolationFps={config.videoChannelId==="local-dreamina-canvas"?(config.dreaminaInterpolationFps??30):undefined} onInterpolationChange={value=>updateConfig("dreaminaInterpolationFps",value)}/> : <>
                            <div className="w-auto shrink-0"><ModelPicker config={config} value={model} channelId={config.videoChannelId} onChange={(value,channelId)=>{updateConfig("videoModel",value);if(channelId)updateConfig("videoChannelId",channelId);}} capability="video" className="canvas-compact-control !h-8 !rounded-full" onMissingConfig={()=>openConfigDialog(false)} fullWidth={false}/></div><PippitVideoQuickControls compact provider="other" model={model} size={config.size} seconds={config.videoSeconds} vquality={normalizeVideoResolutionValue(config.vquality)} resolutionOptions={videoResolutionOptions.map(o=>o.value)} resolutionAriaLabel="清晰度" onChange={(key,value)=>updateConfig(key,key==="size"?videoSizeForResolution(config.vquality,value):value)}/>


                            </>}

                            <ComposerGroupNavigation currentId={loadedGroupId||""} busy={running} onLoad={onNavigateGroup||(()=>Promise.resolve())}/>
                            {(firstFrame||lastFrame)&&<Button type="text" size="small" onClick={()=>onUploadFrame("last")}>添加尾帧</Button>}
                            
                            </div><Button data-composer-clear aria-label="清空提示词和参考素材" title="清空输入" type="text" className="!h-8 !w-8 !p-0 shrink-0" icon={<Trash2 className="size-4"/>} onClick={onClearPrompt}/>{onHidePrompt&&<Button type="text" aria-label="收起提示词区域" title="隐藏提示词区域" className="!h-8 !w-8 !p-0 shrink-0" icon={<ChevronDown className="size-4"/>} onClick={onHidePrompt}/>}<Button data-rematch-references aria-label="重新匹配" type="text" size="small" className="!h-8 !w-8 !p-0 shrink-0" disabled={running} icon={<RotateCcw className="size-3.5"/>} title="重新匹配（只重新识别当前提示词，不改变开关；已手动删除的素材仍保持排除）" onClick={()=>void onMatchPrompt(prompt)}/> <Button type="primary" aria-label={model.endsWith("_draft")?"开始创作 · 样片":"开始创作"} title={model.endsWith("_draft")?"开始创作 · 样片":"开始创作"} className="!h-8 !w-8 !min-w-8 shrink-0 !rounded-full !p-0 flex items-center justify-center" icon={<ArrowUp className="size-4"/>} disabled={!canGenerate} onClick={onGenerate}/>
                        </div> : <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${bottomSettingsGridClass} ${bottomSettingsCollapsed ? "hidden lg:grid" : "grid"}`}>
                            <label className="grid gap-1 text-xs text-stone-500 dark:text-stone-400">
                                模型
                                <ModelPicker config={config} value={model} channelId={config.videoChannelId} workflowRef={config.videoWorkflowRef} onWorkflowChange={(value) => updateConfig("videoWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("videoModel", value); if (channelId) updateConfig("videoChannelId", channelId); }} capability="video" className="canvas-compact-control !h-11 !rounded-xl" onMissingConfig={() => openConfigDialog(false)} fullWidth />
                            </label>
                            {klingBottom ? (
                                <KlingV26BottomSettings config={config} updateConfig={updateConfig} generateAudio={generateAudio} isKlingV3={klingBottomVariant === "v3"} />
                            ) : (
                                <>
                                    {config.generationProvider === "pippit" && model.endsWith("_draft") ? <span className="grid gap-1 text-xs text-stone-500">清晰度<span className="flex h-11 items-center rounded-xl border px-3">480P 样片</span></span> : <QuickSelect label="清晰度" value={normalizeVideoResolutionValue(config.vquality)} options={isSeedanceVideoConfig(config) ? videoResolutionOptions.slice(0, 3) : videoResolutionOptions} onChange={(value) => { updateConfig("vquality", value); if (!isPippitConfig({ ...config, model, videoModel: model })) updateConfig("size", videoSizeForResolution(value, config.size)); }} />}
                                    {isPippitConfig({ ...config, model, videoModel: model }) ? <PippitVideoQuickControls model={model} size={config.size} seconds={config.videoSeconds} onChange={updateConfig} /> : <>
                                        <QuickSelect label="尺寸" value={videoSizeForResolution(config.vquality, config.size)} options={videoSizeOptions(config.vquality)} onChange={(value) => updateConfig("size", value)} />
                                        {cogVideoX3 ? <QuickSelect label="秒数" value={normalizeCogVideoX3Duration(config.videoSeconds)} options={cogVideoX3DurationOptions} onChange={(value) => updateConfig("videoSeconds", value)} /> : <QuickNumber label="秒数" value={autodl ? config.videoSeconds ?? "" : normalizeVideoSeconds(config.videoSeconds)} min={1} max={30} onChange={(value) => updateConfig("videoSeconds", value)} clampOnChange={!autodl} normalizeOnBlur={autodl ? (value) => normalizeAutoDLDuration(value, autodlWorkflow) : undefined} />}
                                    </>}

                                    {audioGenerationEnabled ? <QuickSwitch label="生成音频" checked={generateAudio} onChange={(checked) => updateConfig("videoGenerateAudio", String(checked))} /> : null}
                                    {motionControl ? <QuickSelect label="角色朝向参考" value={normalizeCharacterOrientation(config.videoCharacterOrientation)} options={characterOrientationOptions} onChange={(value) => updateConfig("videoCharacterOrientation", value)} /> : null}
                                </>
                            )}
                            <QuickNumber label="任务" value={String(taskCount)} min={1} max={6} onChange={(value) => onTaskCountChange(normalizeVideoCount(value))} />
                            {!pippitBottom ? <ReferenceQuickActions imageCount={references.length} videoCount={videoReferences.length} audioCount={audioReferences.length} onPasteReferences={onPasteReferences} onUploadReferences={onUploadReferences} /> : null}
                            <Button type="primary" className="hidden h-11 min-w-28 items-center justify-center gap-1.5 rounded-xl lg:flex" icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                                {pendingCount ? `开始创作 · ${pendingCount} 进行中` : "开始创作"}
                            </Button>
                        </div>}
                        {!pippitBottom && (firstFrame || lastFrame || references.length || videoReferences.length || audioReferences.length) ? (
                            <div className="grid gap-2">
                                {firstFrame || lastFrame ? <FrameReferenceStrip firstFrame={firstFrame} lastFrame={lastFrame} compact onUploadFrame={onUploadFrame} onRemoveFrame={onRemoveFrame} /> : null}
                                {references.length ? <ReferenceImageStrip references={references} compact onRemoveReference={onRemoveReference} onMoveReference={onMoveReference} /> : null}
                                {videoReferences.length ? <ReferenceVideoStrip references={videoReferences} compact onRemoveReference={onRemoveVideoReference} onMoveReference={onMoveVideoReference} /> : null}
                                {audioReferences.length ? <ReferenceAudioStrip references={audioReferences} compact onRemoveReference={onRemoveAudioReference} onMoveReference={onMoveAudioReference} /> : null}
                            </div>
                        ) : null}
                    </div>
                </div>
                <Modal title="视频生成参数" open={settingsOpen} onCancel={() => setSettingsOpen(false)} footer={null} width={520}><GenerationSettings config={config} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog}/></Modal>
            </div>
        );
    }

    return (
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-stone-200 bg-card shadow-sm dark:border-stone-800 lg:min-h-0">
            <div className="shrink-0 p-4 pb-3">
                <WorkbenchHeader currentLayout={currentLayout} onLayoutChange={onLayoutChange} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
                <WorkbenchSection title="提示词">
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPastePrompt}>读取剪贴板</Button>
                            <Button size="small" icon={<Trash2 className="size-3.5" />} onClick={onClearPrompt}>清空</Button>
                            <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={onOpenPromptLibrary}>提示词库</Button>
                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker()}>我的素材</Button>
                        </div>
                        <PromptReferenceInput key={focusSceneRevision} value={prompt} bindings={referenceBindings} boundNames={boundNames} onChange={onPromptChange} onBind={onBindReference} onMatch={matchAutomatically} rows={6} placeholder="描述镜头运动、主体动作、场景氛围和画面风格" />
                    </div>
                </WorkbenchSection>
                {frameReferencesEnabled ? (
                    <WorkbenchSection title="首尾帧" count={[firstFrame, lastFrame].filter(Boolean).length}>
                        <FrameReferenceStrip firstFrame={firstFrame} lastFrame={lastFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
                    </WorkbenchSection>
                ) : null}
                <WorkbenchSection title="参考图" count={references.length}>
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences}>剪切板</Button>
                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("image")}>从素材库选择</Button>
                        </div>
                        <ReferenceImageStrip references={references} maxCount={referenceLimits.images} onRemoveReference={onRemoveReference} onMoveReference={onMoveReference} />
                    </div>
                </WorkbenchSection>
                <WorkbenchSection title="参考视频" count={videoReferences.length}>
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteVideoReferences}>剪贴板</Button>
                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("video")}>从素材库选择</Button>
                        </div>
                        <ReferenceVideoStrip references={videoReferences} maxCount={referenceLimits.videos} onRemoveReference={onRemoveVideoReference} onMoveReference={onMoveVideoReference} />
                    </div>
                </WorkbenchSection>
                <WorkbenchSection title="参考音频" count={audioReferences.length}>
                    <div className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                            <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteAudioReferences}>剪贴板</Button>
                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={onUploadReferences}>上传</Button>
                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker("audio")}>从素材库选择</Button>
                        </div>
                        <ReferenceAudioStrip references={audioReferences} maxCount={referenceLimits.audios} onRemoveReference={onRemoveAudioReference} onMoveReference={onMoveAudioReference} />
                    </div>
                </WorkbenchSection>
                {motionControl ? <CharacterOrientationSetting value={config.videoCharacterOrientation} onChange={(value) => updateConfig("videoCharacterOrientation", value)} /> : null}
                <GenerationSettings config={config} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                <WorkbenchSection title="任务数量">
                    <TaskCountControl value={taskCount} onChange={onTaskCountChange} />
                </WorkbenchSection>
            </div>
            <div className="shrink-0 border-t border-stone-200 p-4 dark:border-stone-800">
                {config.generationProvider === "pippit" ? <div className="mb-2 flex flex-wrap items-center gap-2"><PippitCreditIndicator /><span className="text-xs opacity-60">· 积分样片版</span></div> : null}
                <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} disabled={!canGenerate} onClick={onGenerate}>
                    {pendingCount ? `开始生成 · ${pendingCount} 进行中` : "开始生成"}
                </Button>
            </div>
        </div>
    );
}

function WorkbenchHeader({ currentLayout, onLayoutChange }: { currentLayout: WorkbenchLayout; onLayoutChange: (layout: WorkbenchLayout) => void }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">视频创作台</h1>
            <div className="flex shrink-0 rounded-lg border border-stone-200 bg-stone-50 p-1 dark:border-stone-800 dark:bg-stone-900">
                <Button size="small" type={currentLayout === "side" ? "primary" : "text"} icon={<PanelLeft className="size-3.5" />} onClick={() => onLayoutChange("side")}>侧边</Button>
                <Button size="small" type={currentLayout === "bottom" ? "primary" : "text"} icon={<PanelBottom className="size-3.5" />} onClick={() => onLayoutChange("bottom")}>底部</Button>
            </div>
        </div>
    );
}

function WorkbenchSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <div className="flex items-center gap-2 px-3 py-2">
                <span className="text-sm font-medium">{title}</span>
                {typeof count === "number" ? <Tag className="m-0 text-xs">{count}</Tag> : null}
            </div>
            <div className="space-y-2 border-t border-stone-200 p-3 dark:border-stone-800">{children}</div>
        </section>
    );
}

function FrameReferenceStrip({ firstFrame, lastFrame, compact = false, onPasteFrame, onUploadFrame, onOpenAssetPicker, onRemoveFrame }: { firstFrame: ReferenceImage | null; lastFrame: ReferenceImage | null; compact?: boolean; onPasteFrame?: (slot: "first" | "last") => void; onUploadFrame: (slot: "first" | "last") => void; onOpenAssetPicker?: (target?: AssetPickerTarget) => void; onRemoveFrame: (slot: "first" | "last") => void }) {
    if (!compact) {
        return (
            <div className="space-y-2">
                <FrameReferenceRow label="首帧" slot="first" reference={firstFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
                <FrameReferenceRow label="尾帧" slot="last" reference={lastFrame} onPasteFrame={onPasteFrame} onUploadFrame={onUploadFrame} onOpenAssetPicker={onOpenAssetPicker} onRemoveFrame={onRemoveFrame} />
            </div>
        );
    }
    return (
        <div className={`grid grid-cols-2 gap-2 rounded-lg border border-dashed border-stone-300 p-2 dark:border-stone-700 ${compact ? "min-h-14" : "min-h-24"}`}>
            <FrameReferenceSlot label="首帧" reference={firstFrame} compact={compact} onUpload={() => onUploadFrame("first")} onRemove={() => onRemoveFrame("first")} />
            <FrameReferenceSlot label="尾帧" reference={lastFrame} compact={compact} onUpload={() => onUploadFrame("last")} onRemove={() => onRemoveFrame("last")} />
        </div>
    );
}

function FrameReferenceRow({ label, slot, reference, onPasteFrame, onUploadFrame, onOpenAssetPicker, onRemoveFrame }: { label: string; slot: "first" | "last"; reference: ReferenceImage | null; onPasteFrame?: (slot: "first" | "last") => void; onUploadFrame: (slot: "first" | "last") => void; onOpenAssetPicker?: (target?: AssetPickerTarget) => void; onRemoveFrame: (slot: "first" | "last") => void }) {
    return (
        <div className="space-y-2 rounded-lg border border-dashed border-stone-300 p-2 dark:border-stone-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{label}</span>
                <div className="flex flex-wrap gap-1">
                    <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => onPasteFrame?.(slot)}>读取剪贴板</Button>
                    <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => onUploadFrame(slot)}>上传</Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onOpenAssetPicker?.(slot === "first" ? "firstFrame" : "lastFrame")}>从素材库选择</Button>
                </div>
            </div>
            <FrameReferenceSlot label={label} reference={reference} compact={false} onUpload={() => onUploadFrame(slot)} onRemove={() => onRemoveFrame(slot)} />
        </div>
    );
}

function FrameReferenceSlot({ label, reference, compact, onUpload, onRemove }: { label: string; reference: ReferenceImage | null; compact: boolean; onUpload: () => void; onRemove: () => void }) {
    return (
        <div className={`group relative flex min-w-0 items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-stone-50 text-xs text-stone-500 dark:border-stone-800 dark:bg-stone-900 ${compact ? "h-12" : "h-20"}`}>
            {reference ? (
                <>
                    <img src={reference.dataUrl} alt={reference.name} className="size-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{label}</span>
                    <span className="absolute inset-x-1 bottom-1 truncate rounded bg-black/60 px-1 py-0.5 text-[10px] text-white">{reference.name}</span>
                    <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={onRemove} aria-label={`移除${label}`}>
                        <Trash2 className="size-3.5" />
                    </button>
                </>
            ) : (
                <button type="button" className="flex size-full items-center justify-center gap-1" onClick={onUpload}>
                    <Upload className="size-3.5" />
                    上传{label}
                </button>
            )}
        </div>
    );
}

type ComposerReference={id:string;name:string;assetId?:string;storageKey?:string;dataUrl?:string;url?:string};
function PippitComposerAssets({trailing,hideUploadActions=false,references,videoReferences,audioReferences,firstFrame,lastFrame,onUploadImages,onUploadAudio,onUploadVideo,onOpenAssetPicker,onRemoveImage,onRemoveVideo,onRemoveAudio,onRemoveFrame,onBindCard,onLocateCard,onReplaceImage}:{
 onReplaceImage?:(item:ReferenceImage,assetId:string,slot?:"first"|"last")=>Promise<void>;
 trailing?:ReactNode;hideUploadActions?:boolean;references:ReferenceImage[];videoReferences:ReferenceVideo[];audioReferences:ReferenceAudio[];firstFrame:ReferenceImage|null;lastFrame:ReferenceImage|null;
 onUploadImages:()=>void;onUploadAudio:()=>void;onUploadVideo:()=>void;onOpenAssetPicker:(target?:AssetPickerTarget)=>void;onRemoveImage:(id:string)=>void;onRemoveVideo:(id:string)=>void;onRemoveAudio:(id:string)=>void;onRemoveFrame:(slot:"first"|"last")=>void;
 onBindCard:(reference:ComposerReference,kind:string,index:number)=>void;onLocateCard:(reference:ComposerReference,kind:string,index:number)=>void;
}){
 const [preview,setPreview]=useState<{url:string;name:string;kind:"image"|"video"}|null>(null),[playingId,setPlayingId]=useState("");
 const audioPlayer=useRef<HTMLAudioElement|null>(null),audioRequest=useRef(0),{message}=App.useApp();
 useEffect(()=>()=>{audioRequest.current++;audioPlayer.current?.pause();},[]);
 useEffect(()=>{if(playingId&&!audioReferences.some(a=>a.id===playingId)){audioRequest.current++;audioPlayer.current?.pause();setPlayingId("");}},[audioReferences,playingId]);
 const playAudio=async(item:ReferenceAudio)=>{const audio=audioPlayer.current??(audioPlayer.current=new Audio()),request=++audioRequest.current;if(playingId===item.id&&!audio.paused){audio.pause();setPlayingId("");return;}audio.pause();audio.src=item.url;audio.onended=()=>setPlayingId("");try{await audio.play();if(request===audioRequest.current)setPlayingId(item.id);}catch{if(request===audioRequest.current){setPlayingId("");message.error("音频无法播放，请检查原文件或重新定位");}}};
 const actions=(item:ComposerReference,kind:string,index:number,frame?:"first"|"last")=><div data-reference-actions className="absolute inset-x-0 bottom-0 z-10 flex justify-around bg-black/65 py-1 text-[10px] text-white backdrop-blur-sm"><button type="button" aria-label={"绑定 "+item.name} onClick={()=>frame?onOpenAssetPicker(frame==="first"?"firstFrame":"lastFrame"):onBindCard(item,kind,index)}>绑定</button><button type="button" aria-label={"定位 "+item.name} onClick={()=>onLocateCard(item,kind,index)}>定位</button></div>;
 const removeClass="absolute right-1 top-1 hidden size-5 items-center justify-center rounded bg-black/70 text-white group-hover:flex group-has-[:focus-visible]:flex";
 const badgeClass="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white";
 const images=[...(firstFrame?[{...firstFrame,slot:"first" as const,label:"首帧",number:1,index:0}]:[]),...(lastFrame?[{...lastFrame,slot:"last" as const,label:"尾帧",number:2,index:1}]:[]),...references.map((item,index)=>({...item,slot:null,label:seedanceReferenceLabel("image",index),number:index+1,index}))];
 return <><div className="flex min-h-20 items-start gap-2 overflow-x-auto pb-1" aria-label="视频参考素材">
 {images.map(item=><LocalAssetMenu key={item.id} reference={item} kind="image"><ImageReplacementTarget onAsset={id=>onReplaceImage?.(item,id,item.slot||undefined)||Promise.resolve()}><article data-reference-asset className="group w-20 shrink-0" title={item.name}><div className="relative size-20 overflow-hidden rounded-xl border border-border bg-secondary"><button type="button" aria-label={"预览参考图片 "+item.name} className="size-full" onClick={()=>setPreview({url:item.dataUrl,name:item.name,kind:"image"})}><img src={item.dataUrl} alt={item.name} className="size-full object-cover"/></button><span data-reference-number className={badgeClass}>{item.number}</span><button type="button" data-remove-reference aria-label={"移除"+item.label} className={removeClass} onClick={()=>item.slot?onRemoveFrame(item.slot):onRemoveImage(item.id)}><Trash2 className="size-3"/></button>{actions(item,"image",item.index,item.slot||undefined)}</div></article></ImageReplacementTarget></LocalAssetMenu>)}
 {videoReferences.map((item,index)=><LocalAssetMenu key={item.id} reference={item} kind="video"><ImageReplacementTarget kind="video"><article data-reference-asset className="group w-20 shrink-0" title={item.name}><div className="relative size-20 overflow-hidden rounded-xl border border-border bg-secondary"><button type="button" aria-label={"预览参考视频 "+item.name} className="size-full" onClick={()=>setPreview({url:item.url,name:item.name,kind:"video"})}><video src={item.url} className="size-full object-cover" muted preload="metadata"/></button><span data-reference-number className={badgeClass}>{index+1}</span><button type="button" data-remove-reference aria-label={"移除"+seedanceReferenceLabel("video",index)} className={removeClass} onClick={()=>onRemoveVideo(item.id)}><Trash2 className="size-3"/></button>{actions(item,"video",index)}</div></article></ImageReplacementTarget></LocalAssetMenu>)}
 {audioReferences.map((item,index)=><LocalAssetMenu key={item.id} reference={item} kind="audio"><ImageReplacementTarget kind="audio"><article data-reference-asset className="group w-20 shrink-0" title={item.name}><div className="relative size-20 overflow-hidden rounded-xl border border-border bg-secondary"><button type="button" aria-label={(playingId===item.id?"暂停参考音频 ":"播放参考音频 ")+item.name} aria-pressed={playingId===item.id} className="flex size-full flex-col items-center justify-center gap-1 px-1 pb-5" onClick={()=>void playAudio(item)}>{playingId===item.id?<Pause className="size-6 text-primary"/>:<Music2 className="size-6 text-primary"/>}<span className="w-full truncate text-center text-[10px]">{item.name}</span></button><span data-reference-number className={badgeClass}>{index+1}</span><button type="button" data-remove-reference aria-label={"移除"+seedanceReferenceLabel("audio",index)} className={removeClass} onClick={()=>onRemoveAudio(item.id)}><Trash2 className="size-3"/></button>{actions(item,"audio",index)}</div></article></ImageReplacementTarget></LocalAssetMenu>)}
 {trailing}
 {!hideUploadActions&&<><button type="button" aria-label="上传参考图片" className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border" onClick={onUploadImages}>图片</button><button type="button" aria-label="上传参考音频" className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border" onClick={onUploadAudio}>音频</button><button type="button" aria-label="上传参考视频" className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border" onClick={onUploadVideo}>视频</button><button type="button" aria-label="从素材库添加参考素材" className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border" onClick={()=>onOpenAssetPicker()}>素材库</button></>}
 </div><Modal title={preview?.name} open={Boolean(preview)} onCancel={()=>setPreview(null)} footer={null} width="min(1000px, 94vw)" centered destroyOnHidden>{preview?.kind==="image"?<img src={preview.url} alt={preview.name} className="max-h-[75vh] w-full object-contain"/>:preview?<video src={preview.url} controls autoPlay className="max-h-[75vh] w-full"/>:null}</Modal></>;
}

function ReferenceImageStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.images, onRemoveReference, onMoveReference }: { references: ReferenceImage[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <div className={`hover-scrollbar hover-scrollbar-hint flex w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed border-stone-300 p-2 overscroll-x-contain dark:border-stone-700 ${compact ? "min-h-14" : "min-h-24 pb-3"}`}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "size-12" : "size-20"} group relative shrink-0 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800`}>
                    <img src={item.dataUrl} alt={item.name} className="size-full object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("image", index)}</span>
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => onRemoveReference(item.id)} aria-label="移除参考图">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-stone-500">暂无参考图，最多 {maxCount} 张</div> : null}
        </div>
    );
}

function ReferenceVideoStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.videos, onRemoveReference, onMoveReference }: { references: ReferenceVideo[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <div className={`hover-scrollbar hover-scrollbar-hint flex w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed border-stone-300 p-2 overscroll-x-contain dark:border-stone-700 ${compact ? "min-h-14" : "min-h-24 pb-3"}`}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "h-12 w-20" : "h-20 w-32"} group relative shrink-0 overflow-hidden rounded-md border border-stone-200 bg-black dark:border-stone-800`}>
                    <video src={item.url} className="size-full object-cover" muted preload="metadata" />
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{seedanceReferenceLabel("video", index)}</span>
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => onRemoveReference(item.id)} aria-label="移除参考视频">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-stone-500">暂无参考视频，最多 {maxCount} 个</div> : null}
        </div>
    );
}

function ReferenceAudioStrip({ references, compact = false, maxCount = SEEDANCE_REFERENCE_LIMITS.audios, onRemoveReference, onMoveReference }: { references: ReferenceAudio[]; compact?: boolean; maxCount?: number; onRemoveReference: (id: string) => void; onMoveReference: (index: number, offset: number) => void }) {
    return (
        <div className={`hover-scrollbar hover-scrollbar-hint flex w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed border-stone-300 p-2 overscroll-x-contain dark:border-stone-700 ${compact ? "min-h-14" : "min-h-24 pb-3"}`}>
            {references.map((item, index) => (
                <div key={item.id} className={`${compact ? "h-12 w-40" : "h-20 w-48"} group relative flex shrink-0 flex-col justify-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-2 dark:border-stone-800 dark:bg-stone-900`}>
                    <div className="flex min-w-0 items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                        <Music2 className="size-4 shrink-0" />
                        <span className="shrink-0 rounded bg-stone-200 px-1 text-[10px] text-stone-700 dark:bg-stone-800 dark:text-stone-200">{seedanceReferenceLabel("audio", index)}</span>
                        <span className="truncate">{item.name}</span>
                    </div>
                    {!compact ? <audio src={item.url} controls className="h-8 w-full" preload="metadata" /> : null}
                    <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => onMoveReference(index, offset)} />
                    <button type="button" className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded bg-black/60 text-white group-hover:flex" onClick={() => onRemoveReference(item.id)} aria-label="移除参考音频">
                        <Trash2 className="size-3.5" />
                    </button>
                </div>
            ))}
            {!references.length ? <div className="flex min-w-full items-center justify-center text-center text-sm text-stone-500">暂无参考音频，{Number.isFinite(maxCount)?"最多 "+maxCount+" 个，":"按本组总时长限制，"}mp3/wav，单个 15MB 内</div> : null}
        </div>
    );
}

function ReferenceQuickActions({ imageCount, videoCount, audioCount, onPasteReferences, onUploadReferences }: { imageCount: number; videoCount: number; audioCount: number; onPasteReferences: () => void; onUploadReferences: () => void }) {
    return (
        <div className="flex h-11 items-center gap-1 rounded-xl border border-stone-200 bg-background px-2 dark:border-stone-800">
            {imageCount || videoCount || audioCount ? <span className="min-w-7 text-xs text-stone-500">{imageCount + videoCount + audioCount} 个</span> : null}
            <Button title="读取剪切板" size="small" type="text" icon={<ClipboardPaste className="size-3.5" />} onClick={onPasteReferences} />
            <Button title="上传参考素材" size="small" type="text" icon={<Upload className="size-3.5" />} onClick={onUploadReferences} />
        </div>
    );
}

function TaskCountControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    return (
        <label className="flex h-11 items-center gap-2 rounded-xl border border-stone-200 bg-background px-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
            <span className="shrink-0">任务</span>
            <input className="h-7 w-16 rounded-lg border border-stone-200 bg-background px-2 text-sm text-stone-900 outline-none dark:border-stone-800 dark:text-stone-100" type="number" min={1} max={6} value={value} onChange={(event) => onChange(normalizeVideoCount(event.target.value))} />
        </label>
    );
}

function CharacterOrientationSetting({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const current = normalizeCharacterOrientation(value);
    return (
        <WorkbenchSection title="角色朝向参考">
            <div className="grid grid-cols-2 gap-2.5">
                {characterOrientationOptions.map((item) => (
                    <button key={item.value} type="button" className={optionPillClass(current === item.value)} onClick={() => onChange(item.value)}>
                        {item.label}
                    </button>
                ))}
            </div>
        </WorkbenchSection>
    );
}

function optionPillClass(active: boolean) {
    return [
        "h-9 rounded-full border bg-transparent px-2 text-sm font-medium transition hover:opacity-80",
        active ? "border-stone-950 text-stone-950 dark:border-stone-100 dark:text-stone-100" : "border-stone-200 text-stone-700 dark:border-stone-800 dark:text-stone-200",
    ].join(" ");
}

function QuickSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
    return (
        <label className="grid gap-1 text-xs text-stone-500 dark:text-stone-400">
            {label}
            <select className="h-11 min-w-0 rounded-xl border border-stone-200 bg-background px-3 text-sm text-stone-900 outline-none dark:border-stone-800 dark:text-stone-100" value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((item) => (
                    <option key={item.value} value={item.value}>
                        {item.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function QuickNumber({ label, value, min, max, onChange, clampOnChange = true, normalizeOnBlur }: { label: string; value: string; min: number; max: number; onChange: (value: string) => void; clampOnChange?: boolean; normalizeOnBlur?: (value: string) => string }) {
    return (
        <label className="grid gap-1 text-xs text-stone-500 dark:text-stone-400">
            {label}
            <input className="h-11 min-w-0 rounded-xl border border-stone-200 bg-background px-3 text-sm text-stone-900 outline-none dark:border-stone-800 dark:text-stone-100" type="number" min={min} max={max} value={value} onChange={(event) => onChange(clampOnChange ? clampQuickNumberValue(event.target.value, min, max) : event.target.value)} onBlur={(event) => onChange(normalizeOnBlur ? normalizeOnBlur(event.target.value) : clampQuickNumberValue(event.target.value, min, max))} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
    );
}

function clampQuickNumberValue(value: string, min: number, max: number) {
    const number = Math.floor(Number(value) || min);
    return String(Math.max(min, Math.min(max, number)));
}

function KlingV26BottomSettings({ config, updateConfig, generateAudio, isKlingV3 }: { config: AiConfig; updateConfig: UpdateAiConfig; generateAudio: boolean; isKlingV3: boolean }) {
    const mode = isKlingV3 && config.videoMode === "4k" ? "4k" : config.videoMode === "pro" ? "pro" : "std";
    const modeOptions = isKlingV3 ? [{ value: "std", label: "720P" }, { value: "pro", label: "1080P" }, { value: "4k", label: "4K" }] : [{ value: "std", label: "标准(720P 无声)" }, { value: "pro", label: "专业(1080P 音频)" }];
    return (
        <>
            <QuickSelect label="模式选择" value={mode} options={modeOptions} onChange={(value) => updateConfig("videoMode", value)} />
            <QuickSelect label="尺寸" value={klingBottomSizeValue(config.size)} options={[{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }]} onChange={(value) => updateConfig("size", value === "1:1" ? "1024x1024" : value)} />
            <QuickNumber label="秒数" value={isKlingV3 ? String(config.videoSeconds ?? "") : normalizeKlingV26Seconds(config.videoSeconds)} min={isKlingV3 ? 3 : 5} max={isKlingV3 ? 15 : 10} onChange={(value) => updateConfig("videoSeconds", isKlingV3 ? value : normalizeKlingV26Seconds(value))} clampOnChange={!isKlingV3} />
            <QuickSwitch label="生成音频" checked={generateAudio} onChange={(checked) => updateConfig("videoGenerateAudio", String(checked))} />
        </>
    );
}


function QuickSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className="grid gap-1 text-xs text-stone-500 dark:text-stone-400">
            {label}
            <span className="flex h-11 items-center justify-center rounded-xl border border-stone-200 bg-background px-3 dark:border-stone-800">
                <Switch size="small" checked={checked} onChange={onChange} />
            </span>
        </label>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-3">
            <WorkbenchSection title="模型">
                <ModelPicker config={config} value={model} channelId={config.videoChannelId} workflowRef={config.videoWorkflowRef} onWorkflowChange={(value) => updateConfig("videoWorkflowRef", value)} onChange={(value, channelId) => { updateConfig("videoModel", value); if (channelId) updateConfig("videoChannelId", channelId); }} capability="video" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </WorkbenchSection>
            <VideoSettingsPanel config={config} modelName={model} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-3" />
        </div>
    );
}

function ResultsPanel({
    className = "",
    results,
    logs,
    pendingCount,
    now,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onDeleteLog,
    onPreviewLog,
    onRetryLog,
    onRenderDraftLog,
    onPreviewResult,
    onRetryResult,
    onCopyPrompt,
    onDownload,
    onSyncResult,
    onSyncLog,
    onSaveAsset,
    syncingVideoIds,
}: {
    className?: string;
    results: GenerationResult[];
    logs: GenerationLog[];
    pendingCount: number;
    now: number;
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onDeleteLog: (log: GenerationLog) => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRetryLog: (log: GenerationLog) => void;
    onRenderDraftLog: (log: GenerationLog) => void;
    onPreviewResult: (result: GenerationResult) => void;
    onRetryResult: (result: GenerationResult) => void;
    onCopyPrompt: (text: string) => void | Promise<void>;
    onDownload: (video: GeneratedVideo, logId?: string, title?: string) => void;
    onSyncResult: (resultId: string, video: GeneratedVideo, index: number) => void;
    onSyncLog: (log: GenerationLog, video: GeneratedVideo, index: number) => void;
    onSaveAsset: (video: GeneratedVideo, logId?: string) => void;
    syncingVideoIds: string[];
}) {
    const visibleResults = results.filter((result) => result.status !== "failed" || pendingCount > 0);
    const liveResultKeys = new Set(visibleResults.flatMap(videoResultIdentityKeys));
    const liveLogIds = new Set(visibleResults.flatMap((result) => [result.taskLogId, result.id]).filter((id): id is string => Boolean(id)));
    const visibleLogs = logs.filter((log) => !liveLogIds.has(log.id) && !videoLogIdentityKeys(log).some((key) => liveResultKeys.has(key)));
    const totalCount = visibleResults.length + visibleLogs.length;
    const allSelected = Boolean(visibleLogs.length) && visibleLogs.every((log) => selectedLogIds.includes(log.id));
    const toggleVisibleLogs = () => onSelectedLogIdsChange(allSelected ? selectedLogIds.filter((id) => !visibleLogs.some((log) => log.id === id)) : Array.from(new Set([...selectedLogIds, ...visibleLogs.map((log) => log.id)])));

    return (
        <section className={`thin-scrollbar rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto lg:p-5 ${className}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <HistoryIcon />
                    <h2 className="truncate text-xl font-semibold">全部成果</h2>
                    <Tag className="m-0">{totalCount}</Tag>
                    {pendingCount ? <Tag className="m-0 px-2 py-1">{pendingCount} 个生成中</Tag> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>新建</Button>
                    <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!visibleLogs.length} onClick={toggleVisibleLogs}>{allSelected ? "取消" : "全选"}</Button>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>删除</Button>
                </div>
            </div>
            {totalCount ? (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {visibleResults.map((result, index) => (result.status === "success" && result.video ? <ResultVideoCard key={result.id} result={result} video={result.video} index={index} syncing={syncingVideoIds.includes(result.video.id)} onCopyPrompt={onCopyPrompt} onDownload={onDownload} onSync={(video) => onSyncResult(result.id, video, index)} onSaveAsset={onSaveAsset} /> : result.status === "failed" ? <FailedVideoCard key={result.id} result={result} error={result.error || "生成失败"} onCopyPrompt={onCopyPrompt} onPreview={() => onPreviewResult(result)} onRetry={() => onRetryResult(result)} /> : <PendingVideoCard key={result.id} result={result} now={now} onCopyPrompt={onCopyPrompt} />))}
                    {visibleLogs.map((log, index) => (
                        <HistoryLogCard key={log.id} log={log} index={index} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} syncing={Boolean(log.video && syncingVideoIds.includes(log.video.id))} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onDelete={() => onDeleteLog(log)} onPreview={() => onPreviewLog(log)} onRetry={() => onRetryLog(log)} onRenderDraft={() => onRenderDraftLog(log)} onCopyPrompt={onCopyPrompt} onDownload={(v) => onDownload(v, log.id, log.title)} onSync={(video) => onSyncLog(log, video, index)} onSaveAsset={(v) => onSaveAsset(v, log.id)} />
                    ))}
                </div>
            ) : (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center dark:border-stone-700 lg:min-h-[560px]">
                    <VideoIcon className="mb-4 size-11 text-stone-400" />
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有生成视频" />
                </div>
            )}
        </section>
    );
}

function HistoryIcon() {
    return <History className="size-4 shrink-0 text-stone-400" />;
}

function ResultVideoCard({ result, video, index, syncing, onCopyPrompt, onDownload, onSync, onSaveAsset }: { result: GenerationResult; video: GeneratedVideo; index: number; syncing: boolean; onCopyPrompt: (text: string) => void | Promise<void>; onDownload: (video: GeneratedVideo) => void; onSync: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <div className="relative aspect-video bg-black">
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    <VideoSourceTag video={video} />
                    <Tag className="m-0 text-[10px]" color="blue">成功</Tag>
                </div>
                <ReferenceThumbnailOverlay references={result.references} className="left-1.5 top-1.5" />
                <video src={video.url} controls className="size-full object-contain" />
            </div>
            <TaskInfo item={result} onCopyPrompt={onCopyPrompt} />
            <VideoMetaBar video={video} index={index} syncing={syncing} onDownload={onDownload} onSync={onSync} onSaveAsset={onSaveAsset} />
        </div>
    );
}

function PendingVideoCard({ result, now, onCopyPrompt }: { result: GenerationResult; now: number; onCopyPrompt: (text: string) => void | Promise<void> }) {
    const progress = typeof result.progress === "number" ? Math.max(0, Math.min(100, Math.floor(result.progress))) : null;
    const durationMs = Math.max(0, now - result.createdAt);
    return (
        <div className="overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div className="relative aspect-video">
                <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)", backgroundSize: "16px 16px" }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                    <LoaderCircle className="size-6 animate-spin" />
                    {progress !== null ? <span className="animate-pulse font-semibold text-sky-500">正在创作 {progress}%</span> : <span>生成中</span>}
                    <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-stone-600 shadow-sm dark:bg-stone-950/70 dark:text-stone-300">{formatDuration(durationMs)}</span>
                </div>
                {progress !== null ? (
                    <div className="absolute inset-x-4 bottom-4 z-10 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[10px] font-medium text-stone-500 dark:text-stone-400">
                            <span>当前创作进度</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                            <div className="h-full rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)] transition-all duration-300" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                ) : null}
            </div>
            <TaskInfo item={{ ...result, durationMs }} onCopyPrompt={onCopyPrompt} />
        </div>
    );
}

function FailedVideoCard({ result, error, onCopyPrompt, onPreview, onRetry }: { result: GenerationResult; error: string; onCopyPrompt: (text: string) => void | Promise<void>; onPreview: () => void; onRetry: () => void }) {
    const [detailOpen, setDetailOpen] = useState(false);
    const detail = result.errorDetail || error;
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="relative flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
                <ReferenceThumbnailOverlay references={result.references} className="left-1.5 top-1.5" />
                <AlertCircle className="size-7 text-red-500" />
                <div className="text-sm font-medium text-red-600 dark:text-red-300">生成失败</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <TaskInfo item={result} error={error} onCopyPrompt={onCopyPrompt} />
            <div className="flex justify-between gap-2 border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" onClick={onPreview}>载入</Button>
                <div className="flex gap-2">
                    <Button size="small" onClick={() => setDetailOpen(true)}>详情</Button>
                    <Button size="small" danger onClick={onRetry}>重试</Button>
                </div>
            </div>
            <Modal title="失败详情" open={detailOpen} width={760} onCancel={() => setDetailOpen(false)} footer={null}>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-stone-950 p-3 text-xs text-stone-100">{detail}</pre>
            </Modal>
        </div>
    );
}

function videoGenerationChannel(log:GenerationLog){
 const id=log.task?.id||"",channelId=log.config?.videoChannelId||log.config?.activeChannelId||"";
 if(id.startsWith("oiioii:")||channelId==="local-oiioii")return "Oii";
 if(id.startsWith("pippit:")||channelId==="local-pippit")return "小云雀";
 if(id.startsWith("dreamina:")||id.startsWith("dreamina-canvas:")||channelId==="local-dreamina"||channelId==="local-dreamina-canvas")return "即梦";
 if(log.model==="导入视频")return "本地导入";
 return channelId|| (log.config?.channelMode==="remote"?"云端渠道":"未记录渠道");
}
function LogVideoPlayer({ log, playerRef, autoPlay = false, speed = 1, className, ariaLabel }: { log: GenerationLog; playerRef?: React.RefObject<HTMLVideoElement | null>; autoPlay?: boolean; speed?: number; className: string; ariaLabel?: string }) {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    const initial = useMemo(() => [log.video?.url || "", log.video?.fallbackUrl || ""].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i), [log.id, log.video?.url, log.video?.fallbackUrl]);
    const [candidates, setCandidates] = useState<string[]>(initial);
    const [index, setIndex] = useState(0);
    const [resolving, setResolving] = useState(!initial.length);
    const [failed, setFailed] = useState(false);
    const [soundBlocked, setSoundBlocked] = useState(false);
    useEffect(() => {
        let active = true;
        const preset = [log.video?.url || "", log.video?.fallbackUrl || ""].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i);
        setCandidates(preset); setIndex(0); setFailed(false); setSoundBlocked(false); setResolving(!preset.length);
        resolveLogVideoCandidates(log).then(({ candidates: resolved }) => {
            if (!active) return;
            const merged = [...resolved, ...preset].filter((u, i, a): u is string => Boolean(u) && a.indexOf(u) === i);
            setCandidates(merged); setIndex(0); setResolving(false);
            if (!merged.length) setFailed(true);
        }).catch(() => { if (!active) return; setResolving(false); if (!preset.length) setFailed(true); });
        return () => { active = false; };
    }, [log.id, log.task?.id, log.video?.storageKey, log.video?.url, log.video?.fallbackUrl]);
    const activeUrl = candidates[index] || "";
    useEffect(() => {
        const el = internalRef.current;
        if (!el || !activeUrl) return;
        el.playbackRate = speed;
        if (!autoPlay) return;
        void el.play().catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                el.muted = true; setSoundBlocked(true); void el.play().catch(() => {});
            }
        });
    }, [activeUrl, autoPlay, speed]);
    const setRef = (node: HTMLVideoElement | null) => { internalRef.current = node; if (playerRef) (playerRef as React.MutableRefObject<HTMLVideoElement | null>).current = node; };
    const handleError = () => { if (index + 1 < candidates.length) setIndex((i) => i + 1); else if (!resolving) setFailed(true); };
    if (resolving && !activeUrl) return <div className="flex min-h-48 size-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-stone-400"><LoaderCircle className="size-5 animate-spin" /><span>正在读取本地视频…</span></div>;
    if (failed || !activeUrl) return <div className="flex min-h-48 size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/85"><AlertCircle className="size-7 text-amber-400" /><p>{log.task?.remoteOnly ? "视频已在即梦画布生成，可在官网查看。" : "本地缓存与源视频均不可用，请检查项目归档目录或原生成渠道。"}</p></div>;
    return <div className="relative flex size-full items-center justify-center"><video key={`${log.id}:${index}`} ref={setRef} aria-label={ariaLabel} src={activeUrl} controls autoPlay={autoPlay} muted={soundBlocked} playsInline preload="auto" onLoadedMetadata={(e) => { e.currentTarget.playbackRate = speed; }} onError={handleError} className={className} />{soundBlocked && <Button size="small" className="!absolute bottom-14 left-4 z-10" onClick={() => { const el = internalRef.current; if (el) { el.muted = false; setSoundBlocked(false); void el.play().catch(() => {}); } }}>开启声音</Button>}</div>;
}
function HistoryLogCard({ log, index, selected, showSelection = true, active, syncing, onSelectedChange, onDelete, onPreview, onRetry, onRenderDraft, onCopyPrompt, onDownload, onSync, onSaveAsset }: { log: GenerationLog; index: number; selected: boolean; showSelection?: boolean; active: boolean; syncing: boolean; onSelectedChange: (checked: boolean) => void; onDelete: () => void; onPreview: () => void; onRetry: () => void; onRenderDraft: () => void; onCopyPrompt: (text: string) => void | Promise<void>; onDownload: (video: GeneratedVideo) => void; onSync: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const [expanded, setExpanded] = useState(false);
    const [detailOpen, setDetailOpen] = useState(false);
    const playerRef = useRef<HTMLVideoElement>(null);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    const [completedFps,setCompletedFps]=useState(log.task?.interpolatedFps);
    useEffect(()=>{setCompletedFps(log.task?.interpolatedFps);if(showSelection||!log.task?.interpolatedNodeId||log.task.interpolatedFps||!window.desktopBridge?.localVideoTaskStates)return;let active=true;void workbench().localVideoTaskStates([log.task.id]).then(rows=>{const fps=rows[0]?.interpolatedFps;if(active&&(fps===30||fps===60))setCompletedFps(fps);}).catch(()=>{});return()=>{active=false;};},[log.id,log.task?.interpolatedFps,showSelection]);
    const [speed, setSpeed] = useState(1);
    const [frameMode,setFrameMode]=useState(false),[promptExpanded,setPromptExpanded]=useState(false);
    const videoNote=useVideoStudioStore(s=>s.placements[log.id]?.note?.trim()||"");
    if (!showSelection) return <div data-video-showcase className="grid min-h-0 overflow-hidden rounded-xl border border-border bg-background md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-h-64 flex-col bg-accent/20">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black/95 md:h-[min(64vh,680px)]">
                {log.video ? <LogVideoPlayer log={log} playerRef={playerRef} autoPlay speed={speed} ariaLabel={`视频详情播放 ${log.title}`} className="max-h-[64vh] w-full object-contain" /> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center text-white"><AlertCircle className="size-8"/><p>{log.task?.remoteOnly ? "视频已在即梦画布生成，正在同步视频文件。也可在官网查看。" : log.error || "暂时没有可播放的视频"}</p></div>}
            </div>
            {frameMode&&log.video&&<VideoFrameCapture log={log} playerRef={playerRef} onClose={()=>setFrameMode(false)}/>}
            {log.video && <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs"><span>{log.video.width} × {log.video.height}{log.video.bytes ? ` · ${formatBytes(log.video.bytes)}` : ""}</span><label className="flex items-center gap-2">播放速度<select aria-label="视频详情播放速度" className="rounded border border-border bg-background px-2 py-1" value={speed} onChange={event=>{const value=Number(event.target.value);setSpeed(value);if(playerRef.current)playerRef.current.playbackRate=value;}}>{[0.5,0.75,1,1.25,1.5,2].map(value=><option key={value} value={value}>{value}×</option>)}</select></label></div>}
        </div>
        <aside aria-label="视频详情参数" className="flex max-h-[72vh] flex-col border-t border-border md:border-l md:border-t-0">
            <div ref={detailScrollRef} data-video-detail-scroll className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">作品信息 · 视频提示词</span><div className="flex items-center gap-1"><Button size="small" type="text" icon={<Copy className="size-3.5"/>} onClick={()=>void onCopyPrompt(log.prompt)}>复制</Button><Button size="small" type="text" aria-label="详情回到顶部" title="回到顶部" icon={<ChevronUp className="size-4"/>} onClick={()=>detailScrollRef.current?.scrollTo({top:0,behavior:"smooth"})}/></div></div>
                <div className="rounded-xl bg-secondary/70 p-3"><p data-detail-prompt className={(promptExpanded?"":"line-clamp-4 ")+"whitespace-pre-wrap break-words text-sm leading-6"}>{log.prompt || "这条导入视频没有提示词"}</p><Button size="small" type="text" onClick={()=>setPromptExpanded(v=>!v)}>{promptExpanded?"收起全文 ∧":"展开全文 ∨"}</Button></div>
                {(log.references?.length || log.firstFrame || log.lastFrame || log.videoReferences?.length || log.audioReferences?.length) ? <section className="space-y-2"><h3 className="text-xs text-muted-foreground">参考素材</h3><div className="grid grid-cols-3 gap-2"><Image.PreviewGroup>{[...(log.references||[]),...(log.firstFrame?[log.firstFrame]:[]),...(log.lastFrame?[log.lastFrame]:[])].map((item,index)=><div key={item.id+index} className="overflow-hidden rounded-lg border border-border bg-secondary/30"><Image alt={item.name} src={item.dataUrl} title={item.name} className="!aspect-square !w-full !object-cover cursor-zoom-in"/></div>)}</Image.PreviewGroup></div>{log.videoReferences?.map(item=><div key={item.id}><p className="truncate text-xs" title={item.name}>{item.name}</p><video aria-label={`参考视频 ${item.name}`} src={item.url} controls preload="none" className="w-full rounded-lg"/></div>)}{log.audioReferences?.map(item=><div key={item.id}><p className="truncate text-xs" title={item.name}>{item.name}</p><audio aria-label={`参考音频 ${item.name}`} src={item.url} controls preload="none" className="w-full"/></div>)}</section> : null}
                {videoNote?<section data-detail-video-note className="space-y-1.5"><h3 className="text-xs font-semibold">备注</h3><div className="rounded-xl bg-secondary/70 p-3 text-xs leading-5 whitespace-pre-wrap break-words">{videoNote}</div></section>:null}
                <details className="space-y-3" open><summary className="cursor-pointer text-xs font-semibold">作品信息与生成详情</summary><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs"><dt className="text-muted-foreground">渠道</dt><dd>{videoGenerationChannel(log)}</dd><dt className="text-muted-foreground">模型</dt><dd className="break-words">{log.model}</dd><dt className="text-muted-foreground">状态</dt><dd>{log.status}</dd><dt className="text-muted-foreground">清晰度</dt><dd>{log.resolution}P</dd><dt className="text-muted-foreground">尺寸</dt><dd>{log.video ? `${log.video.width} × ${log.video.height}` : log.size}</dd><dt className="text-muted-foreground">时长</dt><dd>{log.seconds}s</dd>{log.task?.interpolatedNodeId&&<><dt className="text-muted-foreground">补帧</dt><dd data-completed-interpolation>{completedFps?`已补帧 · ${completedFps} FPS`:"已补帧（帧率未记录）"}</dd></>}<dt className="text-muted-foreground">创建时间</dt><dd>{formatLogTime(log.createdAt)}</dd></dl></details><details className="space-y-3"><summary className="cursor-pointer text-xs font-semibold">查看生成参数</summary><dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 text-xs"><dt>画幅比例</dt><dd>{log.size}</dd><dt>清晰度</dt><dd>{log.resolution}P</dd><dt>生成时长</dt><dd>{log.seconds}s</dd><dt>数量</dt><dd>{log.taskCount||1}</dd><dt>耗时</dt><dd>{formatDuration(log.durationMs)}</dd><dt>任务ID</dt><dd className="break-all">{log.task?.id||"未记录"}{log.task?.id&&<Button size="small" type="text" aria-label="复制视频任务ID" icon={<Copy className="size-3"/>} onClick={()=>void onCopyPrompt(log.task!.id)}/>}</dd></dl></details><section className="space-y-3 border-t border-border pt-4"><h3 className="font-semibold">编辑视频</h3><h4 className="text-xs text-muted-foreground">常用编辑</h4><Button disabled={!log.video} onClick={()=>{playerRef.current?.pause();setFrameMode(true);}}>截取视频帧</Button></section>
                {log.error && <div role="alert" className="space-y-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive"><p className="whitespace-pre-wrap break-words">{log.error}</p>{log.errorDetail && <details><summary>错误详情</summary><pre className="mt-2 overflow-auto whitespace-pre-wrap">{log.errorDetail}</pre></details>}</div>}
            </div>
            <div className="relative flex flex-wrap gap-2 border-t border-border p-4 pr-14"><Button className="!absolute right-3 top-4" size="small" type="text" aria-label="详情跳到底部" title="跳到底部" icon={<ChevronDown className="size-4"/>} onClick={()=>{const e=detailScrollRef.current;if(e)e.scrollTo({top:e.scrollHeight,behavior:"smooth"});}}/><Button onClick={onPreview}>载入参数</Button><Button onClick={()=>window.dispatchEvent(new CustomEvent("xiaoxiao:send-to-agent",{detail:{logId:log.id}}))}>发给 Agent</Button>{log.task?.canvasUrl&&<Button onClick={()=>window.open(log.task!.canvasUrl,"_blank","noopener")}>打开官网画布</Button>}{log.video && <Button type="primary" onClick={()=>setFrameMode(true)}>截取视频帧</Button>}{log.video && <Button title="保存到我的素材" icon={<FolderPlus className="size-4"/>} onClick={()=>onSaveAsset(log.video!)}/>}{log.status==="成功" && log.task?.draft && log.task.draftTaskId && !log.draftRenderTaskId && <Button type="primary" onClick={onRenderDraft}>样片转成片</Button>}{log.model!=="导入视频" && <Button icon={<RotateCcw className="size-3.5"/>} onClick={onRetry}>重新生成</Button>}<Button danger title="移到回收站" icon={<Trash2 className="size-3.5"/>} onClick={onDelete}/></div>
        </aside>
    </div>;
    return (
        <div className={`overflow-hidden rounded-lg border bg-background dark:bg-stone-950 ${active ? "border-stone-900 dark:border-stone-100" : "border-stone-200 dark:border-stone-800"}`}>
            <div className="relative aspect-video bg-stone-100 dark:bg-stone-900">
                <div className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md bg-white/85 px-1.5 py-1 shadow-sm dark:bg-stone-950/80">
                    {showSelection ? <Checkbox checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} /> : null}
                    <Button size="small" type="text" danger title="删除" className="!h-6 !w-6 !p-0" icon={<Trash2 className="size-3.5" />} onClick={onDelete} />
                </div>
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1">
                    {log.video ? <VideoSourceTag video={log.video} /> : null}
                    <Tag className="m-0 text-[10px]" color={log.status === "成功" ? "blue" : log.status === "生成中" ? "processing" : "red"}>{log.status}</Tag>
                </div>
                {log.video ? <LogVideoPlayer log={log} className="size-full bg-black object-contain" /> : <div className="flex size-full flex-col items-center justify-center gap-2 p-5 text-center text-sm text-red-500"><AlertCircle className="size-7" /><span>{log.task?.remoteOnly ? "已在即梦画布生成" : log.error || "没有可显示的视频"}</span></div>}
                <ReferenceThumbnailOverlay references={log.references} className="bottom-1.5 right-1.5" />
            </div>
            <div className="space-y-2 border-t border-stone-200 p-2.5 text-xs dark:border-stone-800">
                <div className={`${PROMPT_HIGHLIGHT_CLASSES} ${expanded ? "" : "line-clamp-2"} whitespace-pre-wrap text-stone-700 dark:text-stone-200`} dangerouslySetInnerHTML={{__html:dialogueHtml(log.prompt)}}/>
                <div className="flex items-center justify-end gap-1">
                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => void onCopyPrompt(log.prompt)}>复制</Button>
                    <Button size="small" type="text" icon={expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : "展开"}</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                    <Tag className="m-0 text-[10px]">{formatLogTime(log.createdAt)}</Tag>
                    <Tag className="m-0 text-[10px]">{log.model}</Tag>
                    <Tag className="m-0 text-[10px]">{log.size}</Tag>
                    <Tag className="m-0 text-[10px]">{log.resolution}p</Tag>
                    <Tag className="m-0 text-[10px]">{log.seconds}s</Tag>
                    <Tag className="m-0 text-[10px]">数量 {log.taskCount || 1}</Tag>
                    <Tag className="m-0 text-[10px]">{formatDuration(log.durationMs)}</Tag>
                </div>
                {log.error ? <div className="flex items-start justify-between gap-2 rounded-md bg-red-100 px-2 py-1 text-red-600 dark:bg-red-950/40 dark:text-red-300"><span className="line-clamp-2 min-w-0">{log.error}</span><Button size="small" type="text" className="!h-auto !p-0 text-xs" onClick={() => setDetailOpen(true)}>详情</Button></div> : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-stone-200 px-2.5 py-2 dark:border-stone-800">
                <div className="flex flex-wrap gap-1">
                    <Button size="small" onClick={onPreview}>载入</Button>
                    {log.status === "成功" && log.task?.draft && log.task.draftTaskId && !log.draftRenderTaskId ? <Button size="small" type="primary" onClick={onRenderDraft}>样片转成片</Button> : null}
                    <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={onRetry}>重试</Button>
                </div>
                {log.video ? <div className="flex shrink-0 gap-1"><Button size="small" title="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(log.video)} onClick={() => onSync(log.video!)} /><Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(log.video!)} /><Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(log.video!)} /></div> : null}
            </div>
            <Modal title="失败详情" open={detailOpen} width={760} onCancel={() => setDetailOpen(false)} footer={null}>
                <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-stone-950 p-3 text-xs text-stone-100">{log.errorDetail || log.error || "没有详情"}</pre>
            </Modal>
        </div>
    );
}

function VideoMetaBar({ video, syncing, onDownload, onSync, onSaveAsset }: { video: GeneratedVideo; index: number; syncing: boolean; onDownload: (video: GeneratedVideo) => void; onSync: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-stone-200 px-2.5 py-2 dark:border-stone-800">
            <div className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-1 text-[10px] text-stone-500 dark:text-stone-400">
                <span>{video.width}x{video.height}</span>
                {video.bytes ? <span>{formatBytes(video.bytes)}</span> : <span>远端地址</span>}
                <span>{formatDuration(video.durationMs)}</span>
            </div>
            <div className="flex shrink-0 gap-1">
                <Button size="small" title="同步到云端存储" icon={<CloudUpload className="size-3.5" />} loading={syncing} disabled={isCloudVideo(video)} onClick={() => onSync(video)} />
                <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onSaveAsset(video)} />
                <Button size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(video)} />
            </div>
        </div>
    );
}

function VideoSourceTag({ video }: { video: GeneratedVideo }) {
    return <Tag className="m-0 text-[10px]" color={video.storageKey ? "default" : "gold"}>{video.storageKey ? "本地缓存" : "AI 临时URL"}</Tag>;
}

function TaskInfo({ item, error, onCopyPrompt }: { item: GenerationResult; error?: string; onCopyPrompt: (text: string) => void | Promise<void> }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
            <div className="rounded-md bg-stone-50 p-2 dark:bg-stone-900">
                <div className={`${expanded ? "" : "line-clamp-2"} whitespace-pre-wrap text-stone-700 dark:text-stone-200`}>{item.prompt}</div>
                <div className="mt-2 flex justify-end gap-1">
                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => void onCopyPrompt(item.prompt)}>复制</Button>
                    <Button size="small" type="text" icon={expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : "展开"}</Button>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <Tag className="m-0">{formatLogTime(item.createdAt)}</Tag>
                <Tag className="m-0">{item.model}</Tag>
                <Tag className="m-0">{item.config.size || "auto"}</Tag>
                <Tag className="m-0">{item.config.vquality || "720"}p</Tag>
                <Tag className="m-0">{item.config.videoSeconds || "6"}s</Tag>
                <Tag className="m-0">数量 {item.taskCount || 1}</Tag>
                {item.durationMs ? <Tag className="m-0">{formatDuration(item.durationMs)}</Tag> : null}
            </div>
            {error ? <div className="rounded-md bg-red-100 px-2 py-1.5 text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}
        </div>
    );
}

function ReferenceThumbnailOverlay({ references, className = "" }: { references?: ReferenceImage[]; className?: string }) {
    const visibleReferences = (references || []).filter((item) => Boolean(item.dataUrl)).slice(0, 3);
    if (!visibleReferences.length) return null;
    return (
        <div className={`absolute z-10 flex items-center gap-1 rounded-md bg-black/55 p-1 shadow-sm backdrop-blur ${className}`}>
            {visibleReferences.map((item) => (
                <img key={item.id} src={item.dataUrl} alt={item.name} className="size-7 rounded border border-white/60 object-cover" />
            ))}
            {(references || []).length > visibleReferences.length ? <span className="px-1 text-[10px] text-white">+{(references || []).length - visibleReferences.length}</span> : null}
        </div>
    );
}

function createResultFromSnapshot(id: string, snapshot: { text: string; config: AiConfig; references: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[]; taskCount?: number }, model: string, status: GenerationResult["status"], extra: Partial<GenerationResult> = {}): GenerationResult {
    return {
        id,
        status,
        createdAt: Date.now(),
        prompt: snapshot.text,
        model,
        config: buildDisplayConfig(snapshot.config, model),
        references: snapshot.references,
        firstFrame: snapshot.firstFrame || null,
        lastFrame: snapshot.lastFrame || null,
        videoReferences: snapshot.videoReferences,
        audioReferences: snapshot.audioReferences,
        taskCount: snapshot.taskCount,
        ...extra,
    };
}

function createResultFromLog(log: GenerationLog, status: GenerationResult["status"]): GenerationResult {
    return {
        id: log.video?.id || log.id,
        status,
        taskLogId: log.id,
        createdAt: log.createdAt,
        prompt: log.prompt,
        model: log.model,
        providerWorkflowRef: log.providerWorkflowRef,
        config: log.config,
        references: log.references || [],
        firstFrame: log.firstFrame || null,
        lastFrame: log.lastFrame || null,
        videoReferences: log.videoReferences || [],
        audioReferences: log.audioReferences || [],
        taskCount: log.taskCount,
        durationMs: log.durationMs,
        progress: log.task?.progress,
        task: log.task,
        video: log.video,
        error: log.error,
        errorDetail: log.errorDetail,
        lastPolledAt: log.lastPolledAt,
        completionNotifiedAt: log.completionNotifiedAt,
    };
}

function buildDisplayConfig(config: AiConfig, model: string): GenerationLogConfig {
    return {
        channelMode: config.channelMode,
        activeChannelId: config.activeChannelId,
        videoChannelId: config.videoChannelId,
        model: config.model,
        videoModel: config.videoModel || model,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        dreaminaInterpolationFps: config.dreaminaInterpolationFps,
        videoMode: config.videoMode,
        videoNegativePrompt: config.videoNegativePrompt,
        videoMultiShot: config.videoMultiShot,
        videoShotType: config.videoShotType,
        videoMultiPrompt: normalizeKlingMultiPrompts(config.videoMultiPrompt),
        videoElementList: normalizeKlingElementList(config.videoElementList),
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoCharacterOrientation: normalizeCharacterOrientation(config.videoCharacterOrientation),
    };
}

async function copyPrompt(text: string, success: (content: string) => void) {
    await navigator.clipboard.writeText(text);
    success("提示词已复制");
}

function formatLogTime(value: number) {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function replaceStoredVideoHistory(logs: GenerationLog[]) {
    if (typeof window === "undefined") return;
    await persistStoredVideoLogs(logs);
    const keepIds = new Set(logs.map((log) => log.id));
    const storedKeys = await logStore.keys();
    await Promise.all(storedKeys.filter((key) => !keepIds.has(key)).map((key) => logStore.removeItem(key)));
}

async function persistStoredVideoLogs(logs: GenerationLog[]) {
    if (typeof window === "undefined" || !logs.length) return;
    await Promise.all(
        logs.map(async (log) => {
            const serialized = serializeLog(log);
            const current = await logStore.getItem<GenerationLog>(log.id);
            if (current && JSON.stringify(current) === JSON.stringify(serialized)) return;
            await logStore.setItem(log.id, serialized);
        }),
    );
}

async function mergeVideoLogs(remoteLogs: GenerationLog[], localLogs: GenerationLog[]) {
    const normalizedRemote = (await normalizeLogsSafely(remoteLogs)).filter(shouldSyncVideoLog);
    const normalizedLocal = await normalizeLogsSafely(localLogs);
    const remoteKeys = new Set(normalizedRemote.flatMap(videoLogIdentityKeys));
    const preservedLocal = normalizedLocal.filter((log) => shouldPreserveLocalLogDuringRemoteMerge(log, remoteKeys));
    return dedupeVideoLogs([...normalizedRemote, ...preservedLocal]);
}

function shouldPreserveLocalLogDuringRemoteMerge(log: GenerationLog, remoteKeys: Set<string>) {
    if (!isLocalClientVideoLog(log) && !(log.status === "生成中" && !log.video)) return false;
    const keys = videoLogIdentityKeys(log);
    return !keys.length || !keys.some((key) => remoteKeys.has(key));
}

function shouldSyncVideoLog(log: GenerationLog) {
    return !isDreaminaTask(log.task?.id) && !isLocalClientVideoLog(log);
}

function dedupeVideoLogs(logs: GenerationLog[]) {
    const merged: GenerationLog[] = [];
    for (const log of logs) {
        const index = merged.findIndex((item) => videoLogsShareIdentity(item, log));
        if (index < 0) {
            merged.push(log);
        } else {
            merged[index] = mergeDuplicateVideoLog(merged[index], log);
        }
    }
    return sortVideoLogs(merged);
}

function videoLogsShareIdentity(a: GenerationLog, b: GenerationLog) {
    if (a.id && b.id && a.id === b.id) return true;
    const aKeys = videoLogIdentityKeys(a);
    if (!aKeys.length) return false;
    const bKeys = new Set(videoLogIdentityKeys(b));
    return aKeys.some((key) => bKeys.has(key));
}

function mergeDuplicateVideoLog(existing: GenerationLog, incoming: GenerationLog) {
    const preferred = shouldPreferVideoLog(incoming, existing) ? incoming : existing;
    const fallback = preferred === incoming ? existing : incoming;
    return {
        ...fallback,
        ...preferred,
        prompt: preferred.prompt || fallback.prompt,
        title: preferred.title || fallback.title,
        references: preferred.references?.length ? preferred.references : fallback.references,
        firstFrame: preferred.firstFrame || fallback.firstFrame,
        lastFrame: preferred.lastFrame || fallback.lastFrame,
        videoReferences: preferred.videoReferences?.length ? preferred.videoReferences : fallback.videoReferences,
        audioReferences: preferred.audioReferences?.length ? preferred.audioReferences : fallback.audioReferences,
        providerWorkflowRef: preferred.providerWorkflowRef || fallback.providerWorkflowRef,
        task: preferred.task && !isLocalClientVideoTask(preferred.task) ? preferred.task : fallback.task,
        video: preferred.video || fallback.video,
        error: preferred.error || fallback.error,
        errorDetail: preferred.errorDetail || fallback.errorDetail,
        durationMs: Math.max(preferred.durationMs || 0, fallback.durationMs || 0),
        lastPolledAt: Math.max(preferred.lastPolledAt || 0, fallback.lastPolledAt || 0) || undefined,
    };
}

function shouldPreferVideoLog(next: GenerationLog, current: GenerationLog) {
    const nextScore = videoLogScore(next);
    const currentScore = videoLogScore(current);
    if (nextScore !== currentScore) return nextScore > currentScore;
    return (next.createdAt || 0) >= (current.createdAt || 0);
}

function mergeBackendVideoTasks(localLogs: GenerationLog[], tasks: VideoResponse[], fallbackConfig: AiConfig) {
    const byKey = new Map<string, GenerationLog>();
    for (const log of localLogs) {
        for (const key of videoLogBackendMergeKeys(log)) byKey.set(key, log);
    }
    const merged = [...localLogs];
    for (const task of tasks) {
        const incoming = backendTaskToLog(task, fallbackConfig);
        const existing = videoTaskIdentityKeys(task).map((key) => byKey.get(key)).find(Boolean);
        const nextLog = mergeBackendTaskIntoLog(existing, incoming, task);
        if (existing) {
            const index = merged.findIndex((item) => item.id === existing.id);
            if (index >= 0) merged[index] = nextLog;
        } else {
            merged.push(nextLog);
        }
        for (const key of videoLogIdentityKeys(nextLog)) byKey.set(key, nextLog);
    }
    return sortVideoLogs(merged);
}

function videoLogBackendMergeKeys(log: GenerationLog) {
    const keys = videoLogIdentityKeys(log);
    if (isLocalClientVideoLog(log)) {
        [log.task?.id, log.task?.task_id].forEach((id) => {
            if (isClientVideoTaskId(id)) keys.push(id);
        });
    }
    return Array.from(new Set(keys.filter((key): key is string => Boolean(key))));
}

function backendTaskToLog(task: VideoResponse, fallbackConfig: AiConfig): GenerationLog {
    const request = parseBackendVideoRequest(task.request_body);
    const model = task.model || request.model || fallbackConfig.videoModel || fallbackConfig.model || "";
    const taskChannelId = videoTaskChannelId(task);
    const config = buildVideoConfig({ ...fallbackConfig, model, videoModel: model, activeChannelId: taskChannelId || fallbackConfig.activeChannelId, videoChannelId: taskChannelId || fallbackConfig.videoChannelId, size: request.size || fallbackConfig.size, vquality: request.resolution || fallbackConfig.vquality, videoSeconds: request.seconds || fallbackConfig.videoSeconds, videoMode: request.mode || fallbackConfig.videoMode, videoNegativePrompt: request.negativePrompt || fallbackConfig.videoNegativePrompt, videoCharacterOrientation: request.characterOrientation || fallbackConfig.videoCharacterOrientation, videoMultiShot: request.multiShot || fallbackConfig.videoMultiShot, videoShotType: request.shotType || fallbackConfig.videoShotType, videoMultiPrompt: request.multiPrompt.length ? request.multiPrompt : fallbackConfig.videoMultiPrompt, videoElementList: request.elementList.length ? request.elementList : fallbackConfig.videoElementList }, model);
    const createdAt = parseTaskTimestamp(task.createdAt ?? task.created_at) || Date.now();
    const status = isFailedVideoTask(task) ? "失败" : isCompletedVideoTask(task) ? "成功" : "生成中";
    const durationMs = Math.max(0, Date.now() - createdAt);
    const video = status === "成功" && (task.video_url || task.url) ? videoFromTaskResponse(task, durationMs) : undefined;
    return {
        id: `backend-${videoTaskIdentityKeys(task)[0] || nanoid()}`,
        createdAt,
        title: (request.prompt || model || "视频任务").slice(0, 12) || "视频任务",
        prompt: request.prompt || "",
        time: new Date(createdAt).toLocaleString("zh-CN", { hour12: false }),
        model,
        providerWorkflowRef: parseWorkflowRef(task.workflowRef),
        config,
        references: [],
        firstFrame: null,
        lastFrame: null,
        videoReferences: [],
        audioReferences: [],
        durationMs,
        size: task.size || request.size || config.size,
        resolution: request.resolution || config.vquality,
        seconds: task.seconds || request.seconds || config.videoSeconds,
        status,
        task,
        video,
        error: status === "失败" ? task.error?.message || "视频生成失败" : undefined,
        errorDetail: status === "失败" ? errorDetail(new VideoRequestError(task.error?.message || "视频生成失败", task)) : undefined,
        lastPolledAt: Date.now(),
    };
}

function mergeBackendTaskIntoLog(existing: GenerationLog | undefined, incoming: GenerationLog, task: VideoResponse): GenerationLog {
    if (!existing) return incoming;
    const durationMs = Math.max(existing.durationMs || 0, incoming.durationMs || 0);
    const baseConfig = { ...existing.config, videoChannelId: incoming.config.videoChannelId || existing.config.videoChannelId, activeChannelId: incoming.config.activeChannelId || existing.config.activeChannelId };
    const providerWorkflowRef = existing.providerWorkflowRef || incoming.providerWorkflowRef;
    const base = { ...existing, providerWorkflowRef, task, config: baseConfig, durationMs, lastPolledAt: Date.now() };
    if (existing.status === "成功" || existing.video) {
        return { ...base, status: "成功", video: existing.video || incoming.video, error: undefined, errorDetail: undefined };
    }
    if (incoming.status === "失败") {
        return { ...base, status: "失败", error: incoming.error, errorDetail: incoming.errorDetail };
    }
    if (incoming.status === "成功" && incoming.video) {
        return { ...base, status: "成功", video: existing.video || incoming.video, error: undefined, errorDetail: undefined };
    }
    return { ...base, status: "生成中", error: undefined, errorDetail: undefined };
}

function parseBackendVideoRequest(value?: string) {
    const parsed = parseJsonRecord(value);
    const fields = parseRecord(parsed.fields);
    const pick = (...keys: string[]) => {
        for (const key of keys) {
            const source = fields && key in fields ? fields[key] : parsed[key];
            const value = fieldString(source);
            if (value) return value;
        }
        return "";
    };
    return {
        prompt: pick("prompt"),
        model: pick("model"),
        size: pick("size", "aspect_ratio"),
        resolution: normalizeResolution(pick("resolution_name", "vquality", "quality")),
        seconds: pick("seconds", "duration", "videoSeconds"),
        mode: pick("mode", "videoMode"),
        negativePrompt: pick("negative_prompt", "videoNegativePrompt"),
        characterOrientation: pick("character_orientation", "videoCharacterOrientation"),
        multiShot: pick("multi_shot", "multi_shots", "videoMultiShot"),
        shotType: pick("shot_type", "videoShotType"),
        multiPrompt: parseRequestMultiPrompt(fields?.multi_prompt ?? parsed.multi_prompt),
        elementList: parseRequestElementList(fields?.element_list ?? fields?.kling_elements ?? parsed.element_list ?? parsed.kling_elements),
    };
}

function parseJsonRecord(value?: string): Record<string, unknown> {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        return parseRecord(parsed) || {};
    } catch {
        return {};
    }
}

function parseRecord(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function fieldString(value: unknown) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return fieldString(value[0]);
    return "";
}

function parseTaskTimestamp(value: unknown) {
    if (typeof value === "number") return value > 1e12 ? value : value * 1000;
    if (typeof value === "string" && value.trim()) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function isClientVideoTaskId(id?: string | null): id is string {
    return typeof id === "string" && id.startsWith("client_video_task_");
}

function normalizeVideoIdentityKey(key?: string | null) {
    const value = typeof key === "string" ? key.trim() : "";
    return value && !isClientVideoTaskId(value) ? value : "";
}

function videoTaskIdentityKeys(task?: VideoResponse | null) {
    const allowClientTaskId = hasBackendVideoTaskBinding(task);
    const normalizeTaskKey = (key?: string | null) => {
        const value = typeof key === "string" ? key.trim() : "";
        return value && (allowClientTaskId || !isClientVideoTaskId(value)) ? value : "";
    };
    return Array.from(new Set([normalizeTaskKey(task?.id), normalizeTaskKey(task?.task_id), normalizeTaskKey(task?.video_id)].filter((key): key is string => Boolean(key))));
}

function hasBackendVideoTaskBinding(task?: VideoResponse | null) {
    if (!task) return false;
    const record = task as Record<string, unknown>;
    const taskId = typeof task.task_id === "string" ? task.task_id.trim() : "";
    const videoId = typeof task.video_id === "string" ? task.video_id.trim() : "";
    return Boolean(
        (taskId && !isClientVideoTaskId(taskId)) ||
        (videoId && !isClientVideoTaskId(videoId)) ||
        task.video_url ||
        task.url ||
        task.request_body ||
        record.response_body ||
        record.responseBody ||
        record.last_response ||
        record.lastResponse
    );
}

function isLocalClientVideoTask(task?: VideoResponse | null) {
    return Boolean(task && [task.id, task.task_id].some(isClientVideoTaskId) && !hasBackendVideoTaskBinding(task));
}

function isLocalClientVideoLog(log: GenerationLog) {
    return isLocalClientVideoTask(log.task);
}

function videoLogIdentityKeys(log: GenerationLog) {
    return Array.from(new Set([...videoTaskIdentityKeys(log.task), normalizeVideoIdentityKey(log.video?.id)].filter((key): key is string => Boolean(key))));
}

function videoResultIdentityKeys(result: GenerationResult) {
    return Array.from(new Set([...videoTaskIdentityKeys(result.task), normalizeVideoIdentityKey(result.video?.id)].filter((key): key is string => Boolean(key))));
}

function videoLogDeleteKeys(log: GenerationLog) {
    return Array.from(new Set([log.id, log.task?.id, log.task?.task_id, log.task?.video_id, log.video?.id].filter((key): key is string => Boolean(typeof key === "string" && key.trim())).map((key) => key.trim())));
}

function videoLogScore(log: GenerationLog) {
    return (log.status === "成功" ? 4 : 0) + (log.video ? 4 : 0) + (log.video?.storageKey ? 2 : 0) + (log.task && !isLocalClientVideoTask(log.task) ? 2 : 0) + (log.errorDetail ? 1 : 0);
}

function referenceUsedByGeneration(reference: ReferenceImage, logs: GenerationLog[], results: GenerationResult[]) {
    if (!reference.storageKey) return false;
    return logs.some((log) => [log.firstFrame, log.lastFrame, ...log.references].some((item) => item?.storageKey === reference.storageKey)) || results.some((result) => [result.firstFrame, result.lastFrame, ...result.references].some((item) => item?.storageKey === reference.storageKey));
}

function mediaReferenceUsedByGeneration(storageKey: string, logs: GenerationLog[], results: GenerationResult[]) {
    return logs.some((log) => [...log.videoReferences, ...log.audioReferences].some((item) => item.storageKey === storageKey)) || results.some((result) => [...result.videoReferences, ...result.audioReferences].some((item) => item.storageKey === storageKey));
}

function generationLogStorageKeys(log: GenerationLog) {
    return {
        media: [log.video?.storageKey, ...log.videoReferences.map((item) => item.storageKey), ...log.audioReferences.map((item) => item.storageKey)].filter((key): key is string => Boolean(key)),
        images: [log.firstFrame?.storageKey, log.lastFrame?.storageKey, ...log.references.map((image) => image.storageKey)].filter((key): key is string => Boolean(key)),
    };
}

function disposableLogStorageKeys(deletedLogs: GenerationLog[], remainingLogs: GenerationLog[], currentReferences: ReferenceImage[], currentMediaReferences: Array<ReferenceVideo | ReferenceAudio>, results: GenerationResult[]) {
    const deleted = deletedLogs.reduce(
        (keys, log) => {
            const next = generationLogStorageKeys(log);
            next.media.forEach((key) => keys.media.add(key));
            next.images.forEach((key) => keys.images.add(key));
            return keys;
        },
        { media: new Set<string>(), images: new Set<string>() },
    );
    const retained = remainingLogs.reduce(
        (keys, log) => {
            const next = generationLogStorageKeys(log);
            next.media.forEach((key) => keys.media.add(key));
            next.images.forEach((key) => keys.images.add(key));
            return keys;
        },
        { media: new Set<string>(), images: new Set<string>() },
    );
    currentReferences.forEach((reference) => {
        if (reference.storageKey) retained.images.add(reference.storageKey);
    });
    currentMediaReferences.forEach((reference) => {
        if (reference.storageKey) retained.media.add(reference.storageKey);
    });
    results.forEach((result) => {
        if (result.video?.storageKey) retained.media.add(result.video.storageKey);
        [...result.videoReferences, ...result.audioReferences].forEach((reference) => {
            if (reference.storageKey) retained.media.add(reference.storageKey);
        });
        [result.firstFrame, result.lastFrame, ...result.references].forEach((reference) => {
            if (reference?.storageKey) retained.images.add(reference.storageKey);
        });
    });
    return { media: [...deleted.media].filter((key) => !retained.media.has(key)), images: [...deleted.images].filter((key) => !retained.images.has(key)) };
}

function updateResult(results: GenerationResult[], id: string, next: Partial<GenerationResult>) {
    return results.map((item) => (item.id === id ? { ...item, ...next } : item));
}

function updateResultByLogId(results: GenerationResult[], logId: string, next: Partial<GenerationResult>) {
    return results.map((item) => (item.taskLogId === logId || item.id === logId ? { ...item, ...next } : item));
}

function mergePendingLogResults(results: GenerationResult[], logs: GenerationLog[]) {
    const updatedResults = results.map((result) => {
        const log = findMatchingPendingLogForResult(result, logs);
        if (!log) return result;
        return { ...result, taskLogId: log.id, task: log.task, progress: log.task?.progress ?? result.progress, durationMs: log.durationMs || result.durationMs, lastPolledAt: log.lastPolledAt || result.lastPolledAt };
    });
    const existingLogIds = new Set(updatedResults.flatMap((item) => [item.taskLogId, item.id]).filter((id): id is string => Boolean(id)));
    const existingTaskKeys = new Set(updatedResults.flatMap(videoResultIdentityKeys));
    const pendingResults = logs.filter((log) => !existingLogIds.has(log.id) && !videoLogIdentityKeys(log).some((key) => existingTaskKeys.has(key))).map((log) => createResultFromLog(log, "pending"));
    return pendingResults.length ? sortVideoResults([...pendingResults, ...updatedResults]) : sortVideoResults(updatedResults);
}

function findMatchingPendingLogForResult(result: GenerationResult, logs: GenerationLog[]) {
    const resultKeys = new Set(videoResultIdentityKeys(result));
    return logs.find((log) => log.id === result.taskLogId || log.id === result.id || videoLogIdentityKeys(log).some((key) => resultKeys.has(key)));
}

function sortVideoResults(results: GenerationResult[]) {
    return [...results].sort((a, b) => b.createdAt - a.createdAt);
}

function sortVideoLogs(logs: GenerationLog[]) {
    return [...logs].sort((a, b) => b.createdAt - a.createdAt);
}

function videoFromTaskResponse(task: VideoResponse, durationMs: number): GeneratedVideo {
    const size = parseTaskVideoSize((task as Record<string, unknown>).size);
    return {
        id: task.id || task.video_id || task.task_id || nanoid(),
        url: task.video_url || task.url || "",
        storageKey: task.storageKey || "",
        durationMs,
        width: size.width,
        height: size.height,
        bytes: 0,
        mimeType: "video/mp4",
    };
}

function parseTaskVideoSize(value: unknown) {
    const match = typeof value === "string" ? value.match(/^(\d+)x(\d+)$/) : null;
    return { width: match ? Number(match[1]) : 1280, height: match ? Number(match[2]) : 720 };
}

function isCompletedVideoTask(task: VideoResponse) {
    return Boolean(task.video_url || task.url) || ["completed", "complete", "done", "succeeded", "success"].includes((task.status || "").toLowerCase());
}

function isFailedVideoTask(task: VideoResponse) {
    return ["failed", "fail", "error", "cancelled", "canceled"].includes((task.status || "").toLowerCase());
}

function isTransientVideoPollError(error: unknown) {
    if (isRetryableWorkflowError(error)) return true;
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return !error.response || status === 408 || status === 429 || Boolean(status && status >= 500);
}

function isRecoverableBackendVideoTask(task: VideoResponse) {
    return !isCompletedVideoTask(task) && !isFailedVideoTask(task);
}

function isCloudVideo(video: GeneratedVideo) {
    return Boolean(video.storageKey);
}

function errorMessage(error: unknown) {
    return cleanVideoError(error instanceof Error ? error.message : "生成失败");
}

function errorDetail(error: unknown) {
    if (error instanceof VideoRequestError && error.detail) return error.detail;
    if (error instanceof Error) return error.stack || error.message;
    try {
        return JSON.stringify(error, null, 2);
    } catch {
        return String(error || "生成失败");
    }
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            logs.push(value);
        });
        return (await normalizeLogsSafely(logs)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLogsSafely(logs: Array<Partial<GenerationLog>>) {
    const normalized = await Promise.all(
        logs.map(async (log) => {
            try {
                return await normalizeLog(log);
            } catch {
                return null;
            }
        }),
    );
    return normalized.filter((log): log is GenerationLog => Boolean(log));
}

async function safeResolveMediaUrl(storageKey: string, fallback: string) {
    try {
        return await resolveMediaUrl(storageKey, fallback);
    } catch {
        return fallback;
    }
}

async function safeResolveImageUrl(storageKey: string | undefined, fallback: string) {
    try {
        return await resolveImageUrl(storageKey, fallback);
    } catch {
        return fallback;
    }
}

async function normalizeLog(log: Partial<GenerationLog>, hydrate = false): Promise<GenerationLog> {
    const video = hydrate && log.video ? await resolvePlayableVideo(log) : log.video;
    const videoReferences = !hydrate ? log.videoReferences || [] : await Promise.all(
        (log.videoReferences || []).map(async (item) => ({
            ...item,
            url: item.storageKey ? await safeResolveMediaUrl(item.storageKey, item.url) : item.url,
        })),
    );
    const audioReferences = !hydrate ? log.audioReferences || [] : await Promise.all(
        (log.audioReferences || []).map(async (item) => ({
            ...item,
            url: item.storageKey ? await safeResolveMediaUrl(item.storageKey, item.url) : item.url,
        })),
    );
    const references = !hydrate ? log.references || [] : await Promise.all(
        (log.references || []).map(async (item) => ({
            ...item,
            dataUrl: await safeResolveImageUrl(item.storageKey, item.dataUrl),
        })),
    );
    const firstFrame = !hydrate ? log.firstFrame || null : log.firstFrame ? { ...log.firstFrame, dataUrl: await safeResolveImageUrl(log.firstFrame.storageKey, log.firstFrame.dataUrl) } : null;
    const lastFrame = !hydrate ? log.lastFrame || null : log.lastFrame ? { ...log.lastFrame, dataUrl: await safeResolveImageUrl(log.lastFrame.storageKey, log.lastFrame.dataUrl) } : null;
    const config = normalizeLogConfig(log);
    return {
        interruptedAt:log.interruptedAt,
        id: log.id || nanoid(),
        draftRenderTaskId: log.draftRenderTaskId,
        renderFromDraftTaskId: log.renderFromDraftTaskId,
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || "未命名",
        prompt: log.prompt || "",
        time: log.time || new Date().toLocaleString("zh-CN", { hour12: false }),
        model: log.model || config.videoModel || "",
        providerWorkflowRef: log.providerWorkflowRef,
        config,
        references,
        firstFrame,
        lastFrame,
        videoReferences,
        audioReferences,
        taskCount: log.taskCount,
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status:!video&&log.task&&isFailedVideoTask(log.task)?"失败":log.status || "成功",
        task: log.task && /^client_video_task_/.test(log.task.id) && config.videoChannelId==="local-dreamina-canvas" ? {...log.task,id:"dreamina-canvas:"+log.task.id} : log.task,
        video,
        error: log.error || log.task?.error?.message,
        errorDetail: log.errorDetail,
        lastPolledAt: log.lastPolledAt,
        completionNotifiedAt: log.completionNotifiedAt,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        firstFrame: log.firstFrame?.storageKey ? { ...log.firstFrame, dataUrl: "" } : log.firstFrame,
        lastFrame: log.lastFrame?.storageKey ? { ...log.lastFrame, dataUrl: "" } : log.lastFrame,
        videoReferences: log.videoReferences.map((item) => (item.storageKey ? { ...item, url: "" } : item)),
        audioReferences: log.audioReferences.map((item) => (item.storageKey ? { ...item, url: "" } : item)),
        config: { ...log.config, videoElementList: serializeKlingElementList(log.config.videoElementList) },
        video: log.video ? { ...log.video, url: log.video.storageKey || log.video.url.includes("/workbench/studio-video/") || log.video.url.includes("/workbench/task-video/") ? "" : log.video.url, fallbackUrl: undefined } : log.video,
    };
}

function isSupportedAudioFile(file: File) {
    return file.type === "audio/mpeg" || file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/x-wav" || /\.(mp3|wav)$/i.test(file.name);
}

function filterAudioReferencesByDuration(existing: ReferenceAudio[], next: ReferenceAudio[], limits: typeof SEEDANCE_REFERENCE_LIMITS & {audioMinDurationMs?:number;audioMaxDurationMs?:number;totalAudioDurationMs?:number}, warn: (content: string) => void) {
    const min=limits.audioMinDurationMs??2000,max=limits.audioMaxDurationMs??limits.maxDurationMs,combined=limits.totalAudioDurationMs??limits.totalDurationMs;
    let total = existing.reduce((sum, item) => sum + (item.durationMs || 0), 0);
    const accepted: ReferenceAudio[] = [];
    let skipped = false;
    for (const item of next) {
        if (item.durationMs && (item.durationMs < min || item.durationMs > max)) {
            skipped = true;
            continue;
        }
        if (item.durationMs && total + item.durationMs > combined) {
            skipped = true;
            continue;
        }
        total += item.durationMs || 0;
        accepted.push(item);
    }
    if (skipped) warn(`已忽略不符合时长要求的参考音频：单个 ${min / 1000}-${max / 1000} 秒，总时长不超过 ${combined / 1000} 秒`);
    return accepted;
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowLeft className="size-3" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-6 !w-6 !min-w-6 !rounded-full !bg-white/85 !p-0 !shadow-sm" icon={<ArrowRight className="size-3" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    const taskChannelId = videoTaskChannelId(log.task);
    return {
        channelMode: log.config?.channelMode || "local",
        activeChannelId: taskChannelId || log.config?.activeChannelId || log.config?.videoChannelId || "",
        videoChannelId: taskChannelId || log.config?.videoChannelId || log.config?.activeChannelId || "",
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        dreaminaInterpolationFps: log.config?.dreaminaInterpolationFps,
        videoMode: log.config?.videoMode || "std",
        videoNegativePrompt: log.config?.videoNegativePrompt || "",
        videoMultiShot: log.config?.videoMultiShot || "false",
        videoShotType: log.config?.videoShotType || "intelligence",
        videoMultiPrompt: normalizeKlingMultiPrompts(log.config?.videoMultiPrompt),
        videoElementList: normalizeKlingElementList(log.config?.videoElementList),
        videoGenerateAudio: log.config?.videoGenerateAudio || "false",
        videoWatermark: log.config?.videoWatermark || "false",
        videoCharacterOrientation: normalizeCharacterOrientation(log.config?.videoCharacterOrientation),
    };
}

function buildLog({ prompt, model, config, references, firstFrame, lastFrame, videoReferences, audioReferences, taskCount, durationMs, status, task, video, error, errorDetail, lastPolledAt, providerWorkflowRef }: { prompt: string; model: string; config: AiConfig; references: ReferenceImage[]; firstFrame?: ReferenceImage | null; lastFrame?: ReferenceImage | null; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[]; taskCount?: number; durationMs: number; status: GenerationLog["status"]; task?: VideoResponse; video?: GeneratedVideo; error?: string; errorDetail?: string; lastPolledAt?: number; providerWorkflowRef?: WorkflowRef }): GenerationLog {
    const logConfig = {
        channelMode: config.channelMode,
        activeChannelId: config.activeChannelId,
        videoChannelId: config.videoChannelId,
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        dreaminaInterpolationFps: config.dreaminaInterpolationFps,
        videoMode: config.videoMode,
        videoNegativePrompt: config.videoNegativePrompt,
        videoMultiShot: config.videoMultiShot,
        videoShotType: config.videoShotType,
        videoMultiPrompt: normalizeKlingMultiPrompts(config.videoMultiPrompt),
        videoElementList: config.videoElementList,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoCharacterOrientation: normalizeCharacterOrientation(config.videoCharacterOrientation),
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || "未命名",
        prompt,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        model,
        providerWorkflowRef,
        config: logConfig,
        references,
        firstFrame: firstFrame || null,
        lastFrame: lastFrame || null,
        videoReferences,
        audioReferences,
        taskCount,
        durationMs,
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
        errorDetail,
        lastPolledAt,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    if (isAutoDLConfig(config, model)) return { ...config, model, videoModel: model, activeChannelId: config.videoChannelId || config.activeChannelId };
    const seedance = isSeedanceVideoConfig({ ...config, model });
    const cogVideoX3 = isCogVideoX3Model(model);
    const klingV26 = isAPIMartKlingV26Config(config, model);
    const apimartKlingV3 = isAPIMartKlingV3Config(config, model);
    const kieKlingV3 = isKIEKlingV3Config(config, model);
    const kieKlingOmni = kieKlingOmniVariant(config, model);
    const klingV3 = apimartKlingV3 || kieKlingV3;
    const kling = klingV26 || klingV3;
    const videoChannelId = resolveVideoChannelId(config, model, config.videoChannelId, config.activeChannelId);
    const videoMode = klingV3 && config.videoMode === "4k" ? "4k" : config.videoMode === "pro" ? "pro" : "std";
    return {
        ...config,
        model,
        videoModel: model,
        videoChannelId,
        activeChannelId: videoChannelId,
        size: (isDreaminaConfig({...config,model,videoModel:model}) || isPippitConfig({ ...config, model, videoModel: model })) ? ratioForSize(config.size) : kling ? normalizeKlingV26Ratio(config.size) : seedance ? normalizeSeedanceRatio(config.size) : normalizeVideoSize(config.size),
        videoSeconds: cogVideoX3 ? normalizeCogVideoX3Duration(config.videoSeconds) : klingV3 ? normalizeKlingV3Seconds(config.videoSeconds) : klingV26 ? normalizeKlingV26Seconds(config.videoSeconds) : normalizeVideoSeconds(config.videoSeconds),
        videoMode,
        videoNegativePrompt: kieKlingV3 ? "" : config.videoNegativePrompt || "",
        videoMultiShot: klingV3 && kieKlingOmni !== "transformation" ? String(boolConfig(config.videoMultiShot, false)) : "false",
        videoShotType: apimartKlingV3 || kieKlingOmni === "text-to-video" || kieKlingOmni === "image-to-video" ? normalizeKlingShotType(config.videoShotType) : "intelligence",
        videoMultiPrompt: klingV3 ? normalizeKlingMultiPrompts(config.videoMultiPrompt) : defaultKlingMultiPrompts(),
        videoElementList: klingV3 && kieKlingOmni !== "transformation" ? normalizeKlingElementList(config.videoElementList) : defaultKlingElementList(),
        vquality: isDreaminaConfig({...config,model,videoModel:model}) ? config.vquality : normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, false) && (!klingV26 || videoMode === "pro")),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
        videoCharacterOrientation: normalizeCharacterOrientation(config.videoCharacterOrientation),
    };
}

function videoTaskChannelId(task?: VideoResponse | null) {
    return task?.userChannelId || task?.channelId || "";
}

function resolveVideoChannelId(config: AiConfig, model: string, ...preferredIds: Array<string | undefined>) {
    const channels = config.channelMode === "remote"
        ? config.publicChannels.map((channel) => ({ id: channel.id || "", models: channel.models || [] }))
        : normalizeLocalChannels(config).map((channel) => ({ id: channel.id, models: channel.models }));
    for (const id of preferredIds) {
        const channelId = (id || "").trim();
        if (channelId && channels.some((channel) => channel.id === channelId && channel.models.includes(model))) return channelId;
    }
    return channels.find((channel) => channel.models.includes(model))?.id || "";
}

function isAPIMartKlingV26Config(config: AiConfig, model: string) {
    return isAPIMartKlingModelConfig(config, model, "kling-v2-6");
}

function isAPIMartKlingV3Config(config: AiConfig, model: string) {
    return isAPIMartKlingModelConfig(config, model, "kling-v3");
}

function isKlingV3Config(config: AiConfig, model: string) {
    return isAPIMartKlingV3Config(config, model) || isKIEKlingV3Config(config, model);
}

function isAPIMartKlingMotionControlConfig(config: AiConfig, model: string) {
    return isAPIMartKlingModelConfig(config, model, "kling-v2-6-motion-control");
}

function isKIEKlingMotionControlConfig(config: AiConfig, model: string) {
    return isKIEKlingModelConfig(config, model, "kling-2-6-motion-control") || isKIEKlingModelConfig(config, model, "kling-3-0-motion-control");
}

function resolveKlingWorkbenchConfig(config: AiConfig, model: string): { provider: "apimart" | "kie"; variant: "v26" | "v3" } | null {
    if (isAPIMartKlingV26Config(config, model)) return { provider: "apimart", variant: "v26" };
    if (isAPIMartKlingV3Config(config, model)) return { provider: "apimart", variant: "v3" };
    if (isKIEKlingV3Config(config, model)) return { provider: "kie", variant: "v3" };
    return null;
}

function isAPIMartKlingModelConfig(config: AiConfig, model: string, key: string) {
    return modelKey(model) === key && videoChannelProtocol(config, model) === "apimart";
}

function isKIEKlingModelConfig(config: AiConfig, model: string, key: string) {
    return modelKey(model) === key && videoChannelProtocol(config, model) === "kie";
}

function videoChannelProtocol(config: AiConfig, model: string) {
    const channelId = resolveVideoChannelId(config, model, config.videoChannelId, config.activeChannelId);
    const channels = config.channelMode === "remote" ? config.publicChannels : normalizeLocalChannels(config);
    const channel = channels.find((item) => (item.id || "") === channelId && (item.models || []).includes(model)) || channels.find((item) => (item.models || []).includes(model)) || channels.find((item) => (item.id || "") === channelId);
    return channel?.protocol || "openai";
}

const characterOrientationOptions = [{ value: "image", label: "图片" }, { value: "video", label: "视频" }];

function normalizeCharacterOrientation(value: string | undefined) {
    return value === "image" ? "image" : "video";
}

function klingBottomSizeValue(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["9:16", "720x1280", "1080x1920"].includes(normalized)) return "9:16";
    if (["1024x1024", "1080x1080"].includes(normalized)) return "1:1";
    return "16:9";
}

function normalizeKlingV26Ratio(value: string) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["9:16", "720x1280", "1080x1920"].includes(normalized)) return "9:16";
    if (["1:1", "1024x1024", "1080x1080"].includes(normalized)) return "1:1";
    return "16:9";
}

function defaultKlingElementList(): VideoElementItem[] {
    return [{ name: "", description: "", references: [] }];
}

function normalizeKlingElementList(value: VideoElementItem[] | undefined): VideoElementItem[] {
    if (!Array.isArray(value) || !value.length) return defaultKlingElementList();
    return value.slice(0, 3).map((item) => ({ name: item?.name || "", description: item?.description || "", references: Array.isArray(item?.references) ? item.references.slice(0, 4) : [] }));
}

function activeKlingElements(value: VideoElementItem[] | undefined) {
    return normalizeKlingElementList(value).filter((item) => item.references.length > 0);
}

function validateKlingElementList(value: VideoElementItem[] | undefined) {
    for (const item of activeKlingElements(value)) {
        if (!item.name.trim()) return "请填写元素名称";
        if (!item.description.trim()) return "请填写元素描述";
        if (item.references.length < 2 || item.references.length > 4) return "元素资源数量需要 2-4 个";
    }
    return "";
}

function parseRequestElementList(value: unknown): VideoElementItem[] {
    const source = typeof value === "string" ? safeParseArray(value) : value;
    if (!Array.isArray(source)) return [];
    return source.map((item) => {
        const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const urls = Array.isArray(record.element_input_urls) ? record.element_input_urls : [];
        const audioUrls = Array.isArray(record.element_input_audio_urls) ? record.element_input_audio_urls : [];
        return {
            name: fieldString(record.name),
            description: fieldString(record.description),
            references: [...urls.map((url, index) => ({ id: nanoid(), kind: elementReferenceKind(String(url)), name: `element-${index + 1}`, type: "", url: String(url) })), ...audioUrls.map((url, index) => ({ id: nanoid(), kind: "audio" as const, name: `element-audio-${index + 1}`, type: "", url: String(url) }))],
        };
    });
}

function serializeKlingElementList(value: VideoElementItem[] | undefined): VideoElementItem[] {
    return normalizeKlingElementList(value).map((item) => ({
        ...item,
        references: item.references.map((reference) => reference.storageKey ? { ...reference, dataUrl: "", url: reference.kind === "image" ? "" : reference.url || "" } : reference),
    }));
}

function elementReferenceKind(value: string): VideoElementReference["kind"] {
    const lower = value.toLowerCase();
    if (/\.(mp4|mov|webm)(\?|$)/.test(lower) || lower.startsWith("data:video/")) return "video";
    if (/\.(mp3|wav|m4a)(\?|$)/.test(lower) || lower.startsWith("data:audio/")) return "audio";
    return "image";
}

function safeParseArray(value: string) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function defaultKlingMultiPrompts() {
    return [{ prompt: "", duration: "1" }];
}

function normalizeKlingShotType(value: string) {
    return value === "customize" ? "customize" : "intelligence";
}

function normalizeKlingMultiPrompts(value: AiConfig["videoMultiPrompt"] | undefined) {
    if (!Array.isArray(value) || !value.length) return defaultKlingMultiPrompts();
    return value.map((item) => ({ prompt: item?.prompt || "", duration: normalizeKlingMultiPromptDuration(item?.duration) }));
}

function normalizeKlingMultiPromptDuration(value: string | undefined) {
    const duration = Math.floor(Number(value) || 1);
    return String(Math.max(1, Math.min(15, duration)));
}

function parseRequestMultiPrompt(value: unknown) {
    const source = Array.isArray(value) ? value[0] : value;
    if (!source) return [];
    if (Array.isArray(source)) return normalizeKlingMultiPrompts(source as AiConfig["videoMultiPrompt"]);
    if (typeof source === "string") {
        try {
            const parsed = JSON.parse(source);
            return Array.isArray(parsed) ? normalizeKlingMultiPrompts(parsed as AiConfig["videoMultiPrompt"]) : [];
        } catch {
            return [];
        }
    }
    return [];
}
function normalizeKlingV26Seconds(value: string) {
    return String(value).trim() === "10" ? "10" : "5";
}

function normalizeKlingV3Seconds(value: string) {
    const seconds = Math.floor(Number(value) || 3);
    return String(Math.max(3, Math.min(15, seconds)));
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(30, seconds)));
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function normalizeVideoCount(value: string | number) {
    const count = Math.floor(Number(value) || 1);
    return Math.max(1, Math.min(6, count));
}

function buildResumeVideoConfig(config: AiConfig, log: GenerationLog): AiConfig {
    const local=useConfigStore.getState().config;const base = ["local-dreamina","local-dreamina-canvas"].includes(log.config.videoChannelId) ? dreaminaVideoConfig(config,{...local,dreaminaVersion:log.config.videoChannelId==="local-dreamina"?"legacy":"canvas"}) : config;
    return buildVideoConfig({ ...base, ...log.config, model: log.model, videoModel: log.model }, log.model);
}

function videoLogTaskId(log: GenerationLog) {
    return log.task?.id || log.task?.video_id || log.task?.task_id || "";
}

function ResolvedGenerationLog({log,children}:{log:GenerationLog;children:(record:GenerationLog)=>ReactNode}) {
    const [record,setRecord]=useState<GenerationLog | null>(null);
    useEffect(()=>{let active=true;setRecord(prev=>prev?.id===log.id?prev:null);normalizeLog(log,true).then(value=>{if(active)setRecord(value);});return()=>{active=false;};},[log]);
    return record?children(record):<p role="status" className="p-4 text-sm">正在读取视频和参考素材…</p>;
}
