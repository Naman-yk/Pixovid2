import { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Clapperboard,
    ClipboardPaste,
    Clock,
    Copy,
    Cpu,
    Eye,
    Film,
    Layers,
    Loader2,
    Music,
    Rocket,
    Scissors,
    Sliders,
    Sparkles,
    Trash2,
    Upload,
    Volume2,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useMe } from "@/lib/useMe";
import {
    ALLOWED_DURATIONS,
    captureBlockFrame as captureBlockFrameApi,
    copyBlock as copyBlockApi,
    createAudioClip as createAudioClipApi,
    createBlock as createBlockApi,
    deleteBlock as deleteBlockApi,
    exportTemplate as exportTemplateApi,
    fetchAdminTemplate,
    fetchAdminTemplates,
    fetchAvatars,
    fetchModels,
    fetchSwapModels,
    modelsForDuration,
    updateAudioClip as updateAudioClipApi,
    updateBlock as updateBlockApi,
    updateTemplate as updateTemplateApi,
    type Avatar,
    type GenerationModel,
    type SwapModelOption,
    type Template,
    type TemplateAudioClip,
    type TemplateBlock,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SignedOut } from "@/components/SignedOut";
import { Timeline, type BlockPatch, type TimelineCaptureApi } from "@/components/timeline/Timeline";
import { BlockInspector } from "@/components/timeline/BlockInspector";
import { AudioClipInspector } from "@/components/timeline/AudioClipInspector";
import { TemplateSetupForm } from "@/components/timeline/TemplateSetupForm";

/** Snap a dragged span to the nearest allowed clip duration. */
function nearestDuration(span: number): number {
    return ALLOWED_DURATIONS.reduce((best, d) =>
        Math.abs(d - span) < Math.abs(best - span) ? d : best,
    );
}

/**
 * Smallest allowed generated duration that can cover `span` seconds (so the block
 * can be cropped down to exactly `span`); falls back to the longest duration.
 */
function durationForSpan(span: number): number {
    const sorted = [...ALLOWED_DURATIONS].sort((a, b) => a - b);
    return sorted.find((d) => d >= span - 1e-3) ?? sorted[sorted.length - 1]!;
}

export function AdminTemplateCreatePage() {
    const { data: session, isPending } = useSession();
    const { loading: meLoading } = useMe();

    const [templates, setTemplates] = useState<Template[]>([]);
    const [current, setCurrent] = useState<Template | null>(null);
    const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
    const [audioClips, setAudioClips] = useState<TemplateAudioClip[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
    const [models, setModels] = useState<GenerationModel[]>([]);
    const [swapModels, setSwapModels] = useState<SwapModelOption[]>([]);
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [trackCount, setTrackCount] = useState(1);
    const [audioTrackCount, setAudioTrackCount] = useState(1);

    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState<string | null>(null);
    const [thumbnailPrompt, setThumbnailPrompt] = useState("");
    const [openError, setOpenError] = useState<string | null>(null);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadingAudio, setUploadingAudio] = useState(false);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const timelineCaptureRef = useRef<TimelineCaptureApi | null>(null);
    // Copy/paste clipboard (id of the block to clone) + latest clips for handlers.
    const [clipboardId, setClipboardId] = useState<string | null>(null);
    const [clipNotice, setClipNotice] = useState<string | null>(null);
    const blocksRef = useRef<TemplateBlock[]>([]);
    blocksRef.current = blocks;
    const audioClipsRef = useRef<TemplateAudioClip[]>([]);
    audioClipsRef.current = audioClips;

    // Selecting a video block clears any audio selection and vice versa.
    const selectVideo = useCallback((id: string | null) => {
        setSelectedId(id);
        if (id) setSelectedAudioId(null);
    }, []);
    const selectAudio = useCallback((id: string | null) => {
        setSelectedAudioId(id);
        if (id) setSelectedId(null);
    }, []);
    // Right-click context menu (position + the block under the cursor, if any).
    const [menu, setMenu] = useState<{ x: number; y: number; blockId: string | null } | null>(null);

    useEffect(() => {
        if (!session?.user) return;
        fetchAdminTemplates().then(setTemplates).catch(() => { });
        fetchModels().then(setModels).catch(() => { });
        fetchSwapModels().then(setSwapModels).catch(() => { });
        fetchAvatars().then(setAvatars).catch(() => { });
    }, [session?.user]);

    const openTemplate = useCallback(async (id: string) => {
        setOpenError(null);
        try {
            const full = await fetchAdminTemplate(id);
            const loaded = (full.blocks ?? []).slice().sort((a, b) => a.startSec - b.startSec);
            const loadedAudio = (full.audioClips ?? []).slice().sort((a, b) => a.startSec - b.startSec);
            setCurrent(full);
            setThumbnailPrompt(full.thumbnailPrompt ?? "");
            setBlocks(loaded);
            setAudioClips(loadedAudio);
            setTrackCount(Math.max(1, ...loaded.map((b) => b.track + 1)));
            setAudioTrackCount(Math.max(1, ...loadedAudio.map((c) => c.track + 1)));
            setSelectedId(null);
            setSelectedAudioId(null);
            setExportError(null);
        } catch (err) {
            setOpenError(err instanceof Error ? err.message : "Failed to open template");
        }
    }, []);

    const selected = blocks.find((b) => b.id === selectedId) ?? null;
    const selectedAudio = audioClips.find((c) => c.id === selectedAudioId) ?? null;
    // Names for the template's avatar slots (falls back to a generic label).
    const avatarLabels = (current?.avatarIds ?? []).map(
        (id, i) => avatars.find((a) => a.id === id)?.name ?? `Avatar ${i + 1}`,
    );

    async function handleCreateBlock(startSec: number, endSec: number, track: number) {
        if (!current) return;
        if (models.length === 0) {
            setExportError("Video models are still loading — try again in a moment.");
            return;
        }
        // Footprint = generated duration: snap the dragged span to an allowed length
        // and pick a model that can generate it.
        const duration = nearestDuration(endSec - startSec);
        const model = (modelsForDuration(models, duration)[0] ?? models[0]!).id;
        const form = new FormData();
        form.set("prompt", "New clip");
        form.set("model", model);
        form.set("startSec", String(startSec));
        form.set("duration", String(duration));
        form.set("track", String(track));
        form.set("order", String(blocks.length));
        try {
            const block = await createBlockApi(current.id, form);
            setBlocks((prev) => [...prev, block].sort((a, b) => a.startSec - b.startSec));
            setTrackCount((c) => Math.max(c, track + 1));
            selectVideo(block.id);
        } catch {
            /* ignore */
        }
    }

    /** First video track with room for [start,end), else a new track on top. */
    function firstFreeVideoTrack(start: number, end: number): number {
        const maxTrack = Math.max(0, ...blocksRef.current.map((b) => b.track));
        for (let t = 0; t <= maxTrack; t++) {
            const overlaps = blocksRef.current.some(
                (b) => b.track === t && start < b.endSec - 1e-3 && end > b.startSec + 1e-3,
            );
            if (!overlaps) return t;
        }
        return maxTrack + 1;
    }

    // Create a video block spanning the two timeline markers. Its generated length
    // snaps up to an allowed duration, cropped so its footprint matches the span.
    async function handleCreateBlockFromMarkers(start: number, end: number) {
        if (!current) return;
        if (models.length === 0) {
            setExportError("Video models are still loading — try again in a moment.");
            return;
        }
        const span = Math.max(1, end - start);
        const duration = durationForSpan(span);
        const footprint = Math.min(span, duration);
        const model = (modelsForDuration(models, duration)[0] ?? models[0]!).id;
        const track = firstFreeVideoTrack(start, start + footprint);
        const form = new FormData();
        form.set("prompt", "New clip");
        form.set("model", model);
        form.set("startSec", String(start));
        form.set("duration", String(duration));
        form.set("cropStart", "0");
        form.set("cropEnd", String(footprint));
        form.set("track", String(track));
        form.set("order", String(blocks.length));
        try {
            const block = await createBlockApi(current.id, form);
            setBlocks((prev) => [...prev, block].sort((a, b) => a.startSec - b.startSec));
            setTrackCount((c) => Math.max(c, track + 1));
            selectVideo(block.id);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to create block");
        }
    }

    // Capture the program-monitor frame (from the clip under the playhead) and set
    // it as the selected block's start/end frame. Face-swap toggles still apply.
    async function handleCaptureFrame(slot: "start" | "end", sourceBlockId: string, atSec: number) {
        if (!current || !selectedId) return;
        setExportError(null);
        try {
            const updated = await captureBlockFrameApi(current.id, selectedId, { sourceBlockId, atSec, slot });
            handleBlockSaved(updated);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to capture frame");
        }
    }

    // Inspector entry point: resolve the current monitor frame, then capture it for
    // the given block. Throws (surfaced by the inspector) if nothing is under the
    // playhead. Returns the updated block so the inspector can refresh its preview.
    async function handleUsePreviewFrame(blockId: string, slot: "start" | "end") {
        if (!current) throw new Error("No template open.");
        const ctx = timelineCaptureRef.current?.getContext() ?? null;
        if (!ctx) {
            throw new Error("Move the playhead over a video clip in the preview, then try again.");
        }
        const updated = await captureBlockFrameApi(current.id, blockId, {
            sourceBlockId: ctx.sourceBlockId,
            atSec: ctx.atSec,
            slot,
        });
        handleBlockSaved(updated);
        return updated;
    }

    // Upload a raw video as a new block (used directly, not AI-generated). It's
    // placed after every existing clip on track 1 (V1) so it never collides.
    async function handleUploadVideoBlock(file: File) {
        if (!current) return;
        setExportError(null);
        setUploadingVideo(true);
        try {
            const startSec = Math.max(0, ...blocksRef.current.map((b) => b.endSec));
            const form = new FormData();
            form.set("sourceVideo", file);
            form.set("startSec", String(startSec));
            form.set("track", "0");
            form.set("order", String(blocks.length));
            const block = await createBlockApi(current.id, form);
            setBlocks((prev) => [...prev, block].sort((a, b) => a.startSec - b.startSec));
            selectVideo(block.id);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to upload video");
        } finally {
            setUploadingVideo(false);
        }
    }

    // Upload an audio file as a new clip, placed after every existing audio clip
    // (on lane A1) so it never collides on insert.
    async function handleUploadAudio(file: File) {
        if (!current) return;
        setExportError(null);
        setUploadingAudio(true);
        try {
            const startSec = Math.max(0, ...audioClipsRef.current.map((c) => c.endSec));
            const form = new FormData();
            form.set("audio", file);
            form.set("startSec", String(startSec));
            form.set("track", "0");
            const clip = await createAudioClipApi(current.id, form);
            setAudioClips((prev) => [...prev, clip].sort((a, b) => a.startSec - b.startSec));
            selectAudio(clip.id);
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Failed to upload audio");
        } finally {
            setUploadingAudio(false);
        }
    }

    function handleChangeAudio(id: string, patch: BlockPatch) {
        setAudioClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    }

    async function handleCommitAudio(id: string, patch: BlockPatch) {
        if (!current) return;
        const form = new FormData();
        for (const [k, v] of Object.entries(patch)) {
            if (v !== undefined) form.set(k, String(v));
        }
        try {
            const updated = await updateAudioClipApi(current.id, id, form);
            setAudioClips((prev) => prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.startSec - b.startSec));
            if (patch.track !== undefined) setAudioTrackCount((c) => Math.max(c, patch.track! + 1));
        } catch {
            /* ignore */
        }
    }

    function handleAudioSaved(updated: TemplateAudioClip) {
        setAudioClips((prev) => prev.map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.startSec - b.startSec));
        setAudioTrackCount((c) => Math.max(c, updated.track + 1));
    }

    function handleAudioDeleted(id: string) {
        setAudioClips((prev) => prev.filter((c) => c.id !== id));
        setSelectedAudioId((cur) => (cur === id ? null : cur));
    }

    function handleChangeBlock(id: string, patch: BlockPatch) {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    }

    async function handleCommitBlock(id: string, patch: BlockPatch) {
        if (!current) return;
        const form = new FormData();
        for (const [k, v] of Object.entries(patch)) {
            if (v !== undefined) form.set(k, String(v));
        }
        try {
            const updated = await updateBlockApi(current.id, id, form);
            setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)).sort((a, b) => a.startSec - b.startSec));
            if (patch.track !== undefined) setTrackCount((c) => Math.max(c, patch.track! + 1));
        } catch {
            /* ignore */
        }
    }

    /** Re-fetch blocks so linked siblings reflect a propagated edit/bake. */
    const refreshBlocks = useCallback(async () => {
        if (!current) return;
        const full = await fetchAdminTemplate(current.id);
        const loaded = (full.blocks ?? []).slice().sort((a, b) => a.startSec - b.startSec);
        setBlocks(loaded);
        setTrackCount((c) => Math.max(c, 1, ...loaded.map((b) => b.track + 1)));
    }, [current]);

    function handleBlockSaved(updated: TemplateBlock) {
        setBlocks((prev) => prev.map((b) => (b.id === updated.id ? updated : b)).sort((a, b) => a.startSec - b.startSec));
        // Linked copies were updated server-side too — pull them in.
        if (updated.linkGroupId) void refreshBlocks();
    }

    function handleBlockDeleted(id: string) {
        setBlocks((prev) => prev.filter((b) => b.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
    }

    async function handleDeleteBlock(id: string) {
        if (!current) return;
        setBlocks((prev) => prev.filter((b) => b.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
        await deleteBlockApi(current.id, id).catch(() => { });
    }

    const handleCopy = useCallback(() => {
        if (!selectedId) {
            setClipNotice("Select a video clip first, then Copy.");
            return;
        }
        setClipboardId(selectedId);
        setClipNotice("Clip copied — press Paste (or ⌘/Ctrl+V) to add a linked copy.");
    }, [selectedId]);

    // Paste a linked copy of the clipboard block at the playhead (or first marker,
    // if set), on the first video track free at that spot. Linked copies share content.
    const handlePaste = useCallback(async () => {
        if (!current) return;
        if (!clipboardId) {
            setClipNotice("Nothing to paste yet — select a clip and Copy it first.");
            return;
        }
        const source = blocksRef.current.find((b) => b.id === clipboardId);
        if (!source) {
            setClipNotice("The copied clip no longer exists — copy a clip again.");
            return;
        }
        // Drop it where the user is looking: a marker if one is set, else the playhead.
        const markers = timelineCaptureRef.current?.getMarkers() ?? [];
        const playhead = timelineCaptureRef.current?.getPlayhead() ?? 0;
        const startSec = Math.max(0, markers[0] ?? playhead);
        const footprint = source.endSec - source.startSec;
        const track = firstFreeVideoTrack(startSec, startSec + footprint);
        setClipNotice("Pasting…");
        try {
            const { block, source: updatedSource } = await copyBlockApi(
                current.id,
                source.id,
                startSec,
                track,
            );
            setBlocks((prev) =>
                [...prev.map((b) => (b.id === updatedSource.id ? updatedSource : b)), block].sort(
                    (a, b) => a.startSec - b.startSec,
                ),
            );
            setTrackCount((c) => Math.max(c, block.track + 1));
            selectVideo(block.id);
            setClipNotice(`Pasted a linked copy at ${Math.round(startSec)}s on track ${track + 1}.`);
        } catch (err) {
            setClipNotice(`Paste failed: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }, [current, clipboardId, selectVideo]);

    // Premiere-style Cmd/Ctrl+C / +V (ignored while typing in a field).
    useEffect(() => {
        if (!current) return;
        function onKey(e: KeyboardEvent) {
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (!(e.metaKey || e.ctrlKey)) return;
            const key = e.key.toLowerCase();
            if (key === "c") handleCopy();
            else if (key === "v") {
                e.preventDefault();
                void handlePaste();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [current, handleCopy, handlePaste]);

    async function handleExport() {
        if (!current) return;
        setExportError(null);
        if (blocks.length === 0) {
            setExportError("Add at least one video block first.");
            return;
        }
        setExporting(true);
        try {
            // Persist the thumbnail description first so the export render (and every
            // future user render) uses it, then export.
            if ((current.thumbnailPrompt ?? "") !== thumbnailPrompt) {
                const form = new FormData();
                form.set("thumbnailPrompt", thumbnailPrompt);
                await updateTemplateApi(current.id, form);
            }
            const updated = await exportTemplateApi(current.id);
            setCurrent(updated);
            setThumbnailPrompt(updated.thumbnailPrompt ?? "");
            setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        } catch (err) {
            setExportError(err instanceof Error ? err.message : "Export failed");
        } finally {
            setExporting(false);
        }
    }

    if ((isPending || meLoading) && !session?.user) return null;
    if (!session?.user) return <SignedOut />;

    // Template picker / creation view.
    if (!current) {
        return (
            <div className="mx-auto max-w-[1700px] px-4 py-5 lg:px-6">
                {/* ── Master NLE Studio Control Bar ── */}
                <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-card via-[#0c0e14] to-card p-4 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* Studio Title & Engine Status */}
                        <div className="flex items-center gap-3.5">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 shadow-lg shadow-primary/20">
                                <Film className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black uppercase tracking-wider text-white">
                                        Pixovid Stitch Studio <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">NLE PRO</span>
                                    </h1>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Multi-track audio engine &amp; frame-accurate synchronized FFmpeg video compositor
                                </p>
                            </div>
                        </div>

                        {/* Middle: Engine Status Badges */}
                        <div className="hidden items-center gap-3 xl:flex">
                            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-muted-foreground">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                                <span className="font-semibold text-white">FFmpeg 6.1</span> Pipeline
                            </div>
                            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                                <span className="font-semibold text-white">Multi-Track Audio</span> Bus
                            </div>
                            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                                <span className="font-semibold text-white">Neural Face</span> Continuity
                            </div>
                        </div>

                        {/* Right: Master Timecode Monitor & VU Meter */}
                        <div className="flex items-center gap-3">
                            {/* SMPTE Timecode Display */}
                            <div className="flex flex-col items-end rounded-lg border border-white/15 bg-black/80 px-3 py-1.5 font-mono shadow-inner shadow-black">
                                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    <Clock className="h-3 w-3 text-primary" />
                                    <span>Timecode · 30fps</span>
                                </div>
                                <span className="text-base font-black tracking-widest text-primary drop-shadow-[0_0_8px_rgba(145,224,255,0.5)]">
                                    00:00:14:28
                                </span>
                            </div>

                            {/* Master Stereo Peak VU Meter */}
                            <div className="flex h-11 items-center gap-1 rounded-lg border border-white/10 bg-black/60 px-2 py-1">
                                <div className="flex flex-col justify-between text-[8px] font-bold text-muted-foreground leading-none">
                                    <span>L</span>
                                    <span>R</span>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="h-2 w-14 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full w-[78%] bg-gradient-to-r from-emerald-500 via-yellow-400 to-primary" />
                                    </div>
                                    <div className="h-2 w-14 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full w-[72%] bg-gradient-to-r from-emerald-500 via-yellow-400 to-primary" />
                                    </div>
                                </div>
                                <span className="text-[9px] font-mono font-bold text-emerald-400">-6dB</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row">
                    {/* Setup rail (Sequence Init & Actor Casting) */}
                    <aside className="w-full shrink-0 lg:w-[380px]">
                        <div className="lg:sticky lg:top-20">
                            <TemplateSetupForm
                                onCreated={(t) => {
                                    setTemplates((prev) => [t, ...prev]);
                                    openTemplate(t.id);
                                }}
                            />
                        </div>
                    </aside>

                    {/* Main workspace */}
                    <main className="flex-1 overflow-hidden">
                        {openError && (
                            <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                                {openError}
                            </p>
                        )}

                        {templates.length > 0 ? (
                            /* Project sequences bin when user has projects */
                            <div className="rounded-2xl border border-white/[0.08] bg-card/40 p-6 shadow-xl backdrop-blur-md">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-4 w-4 text-primary" />
                                        <h2 className="text-base font-bold uppercase tracking-wider text-white">
                                            Sequences &amp; Projects Bin
                                        </h2>
                                    </div>
                                    <span className="rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-xs text-muted-foreground">
                                        {templates.length} {templates.length === 1 ? "sequence" : "sequences"}
                                    </span>
                                </div>
                                <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                                    {templates.map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => openTemplate(t.id)}
                                            className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl hover:shadow-black/50"
                                        >
                                            <div className="relative aspect-video w-full overflow-hidden bg-black">
                                                {t.previewVideoUrl ? (
                                                    <video
                                                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                                        src={t.previewVideoUrl}
                                                        muted
                                                        loop
                                                        playsInline
                                                        preload="metadata"
                                                        onMouseEnter={(e) => void e.currentTarget.play()}
                                                        onMouseLeave={(e) => e.currentTarget.pause()}
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-black to-card p-4 text-center">
                                                        <Clapperboard className="h-7 w-7 text-primary/40" />
                                                        <span className="text-xs font-semibold text-muted-foreground">
                                                            Empty Timeline Track
                                                        </span>
                                                    </div>
                                                )}
                                                <span
                                                    className={
                                                        "absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-md " +
                                                        (t.published
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-black/70 text-white backdrop-blur")
                                                    }
                                                >
                                                    {t.published ? "Published" : "Draft Sequence"}
                                                </span>
                                                <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                                                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                                                        {(t.blocks ?? []).length} Clips
                                                    </span>
                                                    <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-primary backdrop-blur">
                                                        {(t.audioClips ?? []).length} Audio
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="p-3.5">
                                                <div className="truncate text-sm font-bold text-white group-hover:text-primary">
                                                    {t.name}
                                                </div>
                                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                                    {t.description || "Multi-track sequence"}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            /* ── World-Class Adobe Premiere / DaVinci Resolve Timeline Mockup & Engine Hub ── */
                            <div className="space-y-5">
                                {/* Interactive NLE Sequencer Preview Canvas */}
                                <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#090b10] shadow-2xl">
                                    {/* Sequencer Window Header & Transport Controls */}
                                    <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
                                                <Scissors className="h-3.5 w-3.5 text-primary" />
                                                <span>Sequence 01: Multi-Track Master</span>
                                            </div>
                                            <span className="rounded bg-white/5 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                                                3840×2160 · 30.00 fps · YUV420p
                                            </span>
                                        </div>

                                        {/* Transport Controls Palette */}
                                        <div className="flex items-center gap-1">
                                            <div className="flex items-center rounded-lg border border-white/10 bg-black/40 p-0.5 text-xs text-muted-foreground">
                                                <button type="button" className="rounded p-1.5 hover:bg-white/10 hover:text-white" title="Select (V)">
                                                    <Sliders className="h-3.5 w-3.5" />
                                                </button>
                                                <button type="button" className="rounded p-1.5 bg-primary/20 text-primary" title="Razor Cut (C)">
                                                    <Scissors className="h-3.5 w-3.5" />
                                                </button>
                                                <button type="button" className="rounded p-1.5 hover:bg-white/10 hover:text-white" title="Multi-Track Bus">
                                                    <Music className="h-3.5 w-3.5" />
                                                </button>
                                            </div>

                                            <div className="mx-1 h-4 w-px bg-white/10" />

                                            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs font-mono text-primary font-bold">
                                                <span>▶ PLAY</span>
                                                <span className="text-[10px] text-muted-foreground">00:00:07:15</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Timeline Ruler Bar with Playhead Needle */}
                                    <div className="relative border-b border-white/[0.08] bg-black/40 py-1.5 pl-28 pr-4 font-mono text-[10px] text-muted-foreground select-none">
                                        <div className="flex justify-between">
                                            <span>00:00:00</span>
                                            <span>00:00:04</span>
                                            <span>00:00:08</span>
                                            <span>00:00:12</span>
                                            <span>00:00:16</span>
                                            <span>00:00:20</span>
                                            <span>00:00:24</span>
                                        </div>
                                        {/* Playhead Scrubber Handle & Line */}
                                        <div className="absolute left-[44%] top-0 bottom-0 z-20 flex flex-col items-center">
                                            <div className="h-2 w-3 bg-primary" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
                                            <div className="h-full w-px bg-primary drop-shadow-[0_0_4px_rgba(145,224,255,0.8)]" />
                                        </div>
                                    </div>

                                    {/* Multi-Track Lanes Container */}
                                    <div className="relative space-y-1.5 p-3">
                                        {/* Playhead vertical laser line spanning across all track lanes */}
                                        <div className="pointer-events-none absolute left-[44%] top-0 bottom-0 z-20 w-px bg-primary/70 shadow-[0_0_8px_#91E0FF]" />

                                        {/* Track V2: Overlay & Actor Face-Swap Lane */}
                                        <div className="flex h-14 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/50 p-1.5">
                                            <div className="flex w-24 shrink-0 flex-col justify-center rounded-lg border border-white/10 bg-[#12151e] px-2 py-1 text-[11px]">
                                                <div className="flex items-center justify-between font-bold text-indigo-400">
                                                    <span>V2</span>
                                                    <Eye className="h-3 w-3 text-muted-foreground" />
                                                </div>
                                                <span className="text-[9px] text-muted-foreground truncate">Actor Swap</span>
                                            </div>
                                            <div className="relative flex h-full flex-1 items-center gap-2">
                                                {/* Clip 1 */}
                                                <div className="relative flex h-full w-[38%] items-center justify-between rounded-lg border border-indigo-500/40 bg-gradient-to-r from-indigo-950/80 via-indigo-900/60 to-purple-900/70 px-2.5 text-xs text-white shadow-lg">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-indigo-500" />
                                                    <div className="flex items-center gap-1.5">
                                                        <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                                                        <span className="font-bold text-[11px] truncate">Actor_Hero_CloseUp.mp4</span>
                                                    </div>
                                                    <span className="rounded bg-indigo-500/30 px-1 py-0.2 text-[9px] font-mono font-bold text-indigo-200">
                                                        00:00 - 00:06
                                                    </span>
                                                </div>
                                                {/* Gap filler */}
                                                <div className="h-full w-[12%] rounded border border-dashed border-white/10 bg-transparent flex items-center justify-center text-[9px] text-muted-foreground/60">
                                                    Cut Transition
                                                </div>
                                                {/* Clip 2 */}
                                                <div className="relative flex h-full w-[42%] items-center justify-between rounded-lg border border-indigo-500/40 bg-gradient-to-r from-purple-950/80 to-indigo-900/60 px-2.5 text-xs text-white shadow-lg">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-indigo-500" />
                                                    <div className="flex items-center gap-1.5">
                                                        <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                                                        <span className="font-bold text-[11px] truncate">Reaction_Shot_Angle.mp4</span>
                                                    </div>
                                                    <span className="rounded bg-indigo-500/30 px-1 py-0.2 text-[9px] font-mono font-bold text-indigo-200">
                                                        00:10 - 00:22
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Track V1: Base Video Track Lane */}
                                        <div className="flex h-14 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/50 p-1.5">
                                            <div className="flex w-24 shrink-0 flex-col justify-center rounded-lg border border-white/10 bg-[#12151e] px-2 py-1 text-[11px]">
                                                <div className="flex items-center justify-between font-bold text-cyan-400">
                                                    <span>V1</span>
                                                    <Eye className="h-3 w-3 text-muted-foreground" />
                                                </div>
                                                <span className="text-[9px] text-muted-foreground truncate">Main 4K Base</span>
                                            </div>
                                            <div className="relative flex h-full flex-1 items-center">
                                                <div className="relative flex h-full w-[95%] items-center justify-between rounded-lg border border-cyan-500/40 bg-gradient-to-r from-cyan-950/80 via-sky-950/60 to-blue-950/70 px-3 text-xs text-white shadow-lg">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-cyan-500" />
                                                    <div className="flex items-center gap-2">
                                                        <Film className="h-3.5 w-3.5 text-cyan-300" />
                                                        <span className="font-bold text-[11px]">Establishing_Cinematic_4K_Master.mp4</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 font-bold">
                                                            SAR 1:1 · YUV420p
                                                        </span>
                                                        <span className="rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-mono text-white/80">
                                                            00:00 - 00:24
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Track A1: Dialogue Audio Track */}
                                        <div className="flex h-12 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/50 p-1.5">
                                            <div className="flex w-24 shrink-0 flex-col justify-center rounded-lg border border-white/10 bg-[#12151e] px-2 py-0.5 text-[11px]">
                                                <div className="flex items-center justify-between font-bold text-emerald-400">
                                                    <span>A1</span>
                                                    <span className="font-mono text-[9px] text-emerald-400/80">+0.5dB</span>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground truncate">Dialogue Track</span>
                                            </div>
                                            <div className="relative flex h-full flex-1 items-center gap-2">
                                                {/* Dialogue Audio Waveform Clip */}
                                                <div className="relative flex h-full w-[38%] items-center justify-between overflow-hidden rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-950/70 to-teal-950/60 px-2 text-xs text-white">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-emerald-500" />
                                                    {/* SVG Waveform Simulation */}
                                                    <svg className="absolute inset-x-2 inset-y-1 h-6 w-full text-emerald-400/50" viewBox="0 0 200 24" preserveAspectRatio="none">
                                                        <path d="M0 12 Q5 2, 10 12 T20 12 T30 4 T40 12 T50 18 T60 12 T70 2 T80 12 T90 20 T100 12 T110 5 T120 12 T130 18 T140 12 T150 3 T160 12 T170 19 T180 12 T190 6 T200 12" fill="none" stroke="currentColor" strokeWidth="2" />
                                                    </svg>
                                                    <span className="relative z-10 text-[10px] font-bold text-emerald-200 truncate">
                                                        Actor_Voiceover_Take1.wav
                                                    </span>
                                                    <span className="relative z-10 text-[9px] font-mono text-emerald-300/80">
                                                        48kHz
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Track A2: BGM / Soundtrack Track */}
                                        <div className="flex h-12 items-center gap-2 rounded-xl border border-white/[0.06] bg-black/50 p-1.5">
                                            <div className="flex w-24 shrink-0 flex-col justify-center rounded-lg border border-white/10 bg-[#12151e] px-2 py-0.5 text-[11px]">
                                                <div className="flex items-center justify-between font-bold text-amber-400">
                                                    <span>A2</span>
                                                    <span className="font-mono text-[9px] text-amber-400/80">-3.8dB</span>
                                                </div>
                                                <span className="text-[9px] text-muted-foreground truncate">BGM Score</span>
                                            </div>
                                            <div className="relative flex h-full flex-1 items-center">
                                                <div className="relative flex h-full w-[95%] items-center justify-between overflow-hidden rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-950/70 to-orange-950/60 px-2 text-xs text-white">
                                                    <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l bg-amber-500" />
                                                    {/* Stereo SVG Waveform Simulation */}
                                                    <svg className="absolute inset-x-2 inset-y-1 h-6 w-full text-amber-400/50" viewBox="0 0 400 24" preserveAspectRatio="none">
                                                        <path d="M0 12 Q10 5, 20 12 T40 12 T60 3 T80 12 T100 18 T120 12 T140 14 T160 12 T180 15 T200 12 T220 2 T240 12 T260 21 T280 12 T300 4 T320 12 T340 19 T360 12 T380 7 T400 12" fill="none" stroke="currentColor" strokeWidth="2" />
                                                    </svg>
                                                    <span className="relative z-10 text-[10px] font-bold text-amber-200">
                                                        Cinematic_Score_FullMix.mp3 (Auto-Ducked beneath speech)
                                                    </span>
                                                    <span className="relative z-10 text-[9px] font-mono text-amber-300/80">
                                                        Stereo Mixed
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Timeline Sequencer Status Footer */}
                                    <div className="flex flex-wrap items-center justify-between border-t border-white/[0.08] bg-white/[0.02] px-4 py-2 text-[11px] text-muted-foreground">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1.5 text-emerald-400">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>Render Cache: Active</span>
                                            </span>
                                            <span>·</span>
                                            <span>Audio Buffer: 48,000 Hz 32-bit Float</span>
                                            <span>·</span>
                                            <span>Dropouts: 0</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-primary font-semibold">
                                            <span>Ready for Sequence Initialization</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 4 Architectural Pillars of the FFmpeg Pipeline */}
                                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="rounded-xl border border-white/10 bg-card/40 p-4 shadow-lg backdrop-blur-md">
                                        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
                                            <Scissors className="h-4 w-4" />
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                                            Multi-Track Slicing
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                            Frame-accurate in/out trimming and dynamic timeline segment composition with black-frame gap filler.
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-card/40 p-4 shadow-lg backdrop-blur-md">
                                        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400">
                                            <Volume2 className="h-4 w-4" />
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                                            Multi-Track Audio Bus
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                            Independent track start offsets, overlapping audio summation, and automated silence padding.
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-card/40 p-4 shadow-lg backdrop-blur-md">
                                        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                                            <Sparkles className="h-4 w-4" />
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                                            Biometric Facial Mesh
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                            Neural diffusion identity injection mapping actor likeness across start and end frame keyframes.
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-white/10 bg-card/40 p-4 shadow-lg backdrop-blur-md">
                                        <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                                            <Cpu className="h-4 w-4" />
                                        </div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                                            FFmpeg Fast Demuxer
                                        </h3>
                                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                            Hardware-accelerated input seeking (<span className="font-mono text-emerald-300">-ss/-t</span>), aspect ratio padding, and YUV420p master export.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>
        );
    }

    // Editor view.
    return (
        <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => setCurrent(null)} title="Back">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold">{current.name}</h1>
                        <p className="text-xs text-muted-foreground">
                            {current.avatarSlots} avatar slot(s) · {blocks.length} block(s) · {audioClips.length}{" "}
                            audio ·{" "}
                            <span className={current.published ? "text-primary" : undefined}>
                                {current.published ? "published" : "draft"}
                            </span>
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadVideoBlock(file);
                            e.target.value = ""; // allow re-selecting the same file
                        }}
                    />
                    <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleUploadAudio(file);
                            e.target.value = ""; // allow re-selecting the same file
                        }}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => videoInputRef.current?.click()}
                        disabled={uploadingVideo}
                        title="Add a clip from an uploaded video (no AI generation)"
                    >
                        {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload video
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={uploadingAudio}
                        title="Add an audio clip to the timeline"
                    >
                        {uploadingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />} Upload audio
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCopy} disabled={!selectedId} title="Copy clip (⌘/Ctrl+C)">
                        <Copy className="h-4 w-4" /> Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handlePaste()} disabled={!clipboardId} title="Paste linked copy (⌘/Ctrl+V)">
                        <ClipboardPaste className="h-4 w-4" /> Paste
                    </Button>
                </div>
            </div>

            {clipNotice && (
                <p className="mb-2 text-sm text-primary" role="status">
                    {clipNotice}
                </p>
            )}

            <p className="mb-2 text-sm text-muted-foreground">
                Drag on empty space to create a video clip. Upload videos and audio with the buttons above.
                Drag clips to move them and drag their edges to crop. The timeline grows to fit your clips;
                overlapping audio is mixed together.
            </p>

            <Timeline
                blocks={blocks}
                trackCount={trackCount}
                audioClips={audioClips}
                audioTrackCount={audioTrackCount}
                selectedId={selectedId}
                selectedAudioId={selectedAudioId}
                onSelect={selectVideo}
                onSelectAudio={selectAudio}
                onAddTrack={() => setTrackCount((c) => c + 1)}
                onAddAudioTrack={() => setAudioTrackCount((c) => c + 1)}
                onCreateBlock={handleCreateBlock}
                onCreateBlockFromMarkers={handleCreateBlockFromMarkers}
                onCaptureFrame={handleCaptureFrame}
                captureApiRef={timelineCaptureRef}
                onChangeBlock={handleChangeBlock}
                onCommitBlock={handleCommitBlock}
                onChangeAudio={handleChangeAudio}
                onCommitAudio={handleCommitAudio}
                onContextMenu={(blockId, e) => setMenu({ x: e.clientX, y: e.clientY, blockId })}
            />

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
                {/* Export panel */}
                <div className="rounded-2xl border border-white/[0.08] bg-card/40 p-5">
                    <h2 className="mb-1 flex items-center gap-2 text-lg font-medium">
                        <Rocket className="h-4 w-4 text-primary" /> FFmpeg Stitch &amp; Export
                    </h2>
                    <p className="mb-4 text-sm text-muted-foreground">
                        Synchronizes all timeline slices, mixes multi-track audio with exact offsets, and stitches a unified high-definition MP4.
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="text-sm">
                            <span className="text-muted-foreground">Avatars: </span>
                            {avatarLabels.length > 0 ? (
                                avatarLabels.map((name, i) => (
                                    <span key={i} className="font-medium">
                                        {i > 0 ? ", " : ""}
                                        {name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-muted-foreground">none (pure video/audio stitch mode)</span>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="tpl-thumbnail-prompt">Thumbnail description</Label>
                            <Textarea
                                id="tpl-thumbnail-prompt"
                                rows={3}
                                value={thumbnailPrompt}
                                onChange={(e) => setThumbnailPrompt(e.target.value)}
                                placeholder="e.g. The actor smiling on a neon-lit city street at night, close-up, cinematic"
                            />
                            <p className="text-xs text-muted-foreground">
                                Describes the cover thumbnail. Generated on export and reused when users generate from this template.
                            </p>
                        </div>

                        {exportError && <p className="text-sm text-destructive">{exportError}</p>}
                        <Button onClick={handleExport} disabled={exporting} className="w-fit">
                            {exporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" /> Stitching timeline… this can take a few minutes
                                </>
                            ) : (
                                "Stitch & Export Video"
                            )}
                        </Button>
                    </div>

                    {current.previewVideoUrl && (
                        <div className="mt-5">
                            <h3 className="mb-2 text-sm font-medium">Latest export</h3>
                            <video src={current.previewVideoUrl} controls className="w-full rounded-md" />
                        </div>
                    )}
                </div>

                {/* Inspector */}
                <div className="rounded-2xl border border-white/[0.08] bg-card/40 p-5">
                    {selected ? (
                        <BlockInspector
                            templateId={current.id}
                            avatarLabels={avatarLabels}
                            trackCount={trackCount}
                            models={models}
                            swapModels={swapModels}
                            block={selected}
                            onSaved={handleBlockSaved}
                            onDeleted={handleBlockDeleted}
                            onUsePreviewFrame={handleUsePreviewFrame}
                        />
                    ) : selectedAudio ? (
                        <AudioClipInspector
                            templateId={current.id}
                            audioTrackCount={audioTrackCount}
                            clip={selectedAudio}
                            onSaved={handleAudioSaved}
                            onDeleted={handleAudioDeleted}
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Select a video or audio clip on the timeline to edit it.
                        </p>
                    )}
                </div>
            </div>

            {menu && (
                <>
                    {/* click-away / right-click-away closes the menu */}
                    <div
                        className="fixed inset-0 z-50"
                        onPointerDown={() => setMenu(null)}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            setMenu(null);
                        }}
                    />
                    <div
                        className="fixed z-50 min-w-36 overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md"
                        style={{ left: menu.x, top: menu.y }}
                    >
                        <button
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                            disabled={!menu.blockId}
                            onClick={() => {
                                setClipboardId(menu.blockId);
                                setMenu(null);
                            }}
                        >
                            <Copy className="h-4 w-4" /> Copy
                        </button>
                        <button
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent disabled:opacity-50"
                            disabled={!clipboardId}
                            onClick={() => {
                                void handlePaste();
                                setMenu(null);
                            }}
                        >
                            <ClipboardPaste className="h-4 w-4" /> Paste
                        </button>
                        <button
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive hover:bg-accent disabled:opacity-50"
                            disabled={!menu.blockId}
                            onClick={() => {
                                if (menu.blockId) void handleDeleteBlock(menu.blockId);
                                setMenu(null);
                            }}
                        >
                            <Trash2 className="h-4 w-4" /> Delete
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
