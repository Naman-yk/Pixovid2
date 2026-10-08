import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRight,
    CheckCircle2,
    Clapperboard,
    Loader2,
    ScanFace,
    Sparkles,
    UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createTemplate, fetchAvatars, type Avatar, type Template } from "@/lib/api";

const NONE = "__none__";

const PRESET_NAMES = [
    "Cinematic 4K Trailer",
    "Viral 9:16 Reel",
    "Multi-Track Beat Sync",
    "Dialogue Montage",
];

interface Props {
    onCreated: (template: Template) => void;
}

export function TemplateSetupForm({ onCreated }: Props) {
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [avatar1, setAvatar1] = useState("");
    const [avatar2, setAvatar2] = useState(NONE);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchAvatars()
            .then((a) => {
                setAvatars(a);
                if (a[0]) setAvatar1(a[0].id);
            })
            .catch(() => { });
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (!name.trim()) {
            setError("A sequence project name is required.");
            return;
        }
        if (!avatar1 || avatar1 === NONE) {
            setError("Select at least one actor avatar for the sequence.");
            return;
        }
        const avatarIds = [avatar1, avatar2 !== NONE ? avatar2 : null].filter(Boolean) as string[];
        if (new Set(avatarIds).size !== avatarIds.length) {
            setError("Primary and Secondary actors must be different.");
            return;
        }
        setSubmitting(true);
        try {
            const form = new FormData();
            form.set("name", name);
            if (description) form.set("description", description);
            avatarIds.forEach((id) => form.append("avatarIds", id));
            const template = await createTemplate(form);
            onCreated(template);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create timeline sequence");
        } finally {
            setSubmitting(false);
        }
    }

    // ── When user has 0 avatars: Premiere/DaVinci Biometric Actor Setup Card ──
    if (avatars.length === 0) {
        return (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-card/80 via-card/50 to-black/80 p-5 shadow-2xl backdrop-blur-xl">
                {/* Glowing subtle edge ambient */}
                <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-indigo-500/10 blur-3xl" />

                {/* Header status bar */}
                <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <Clapperboard className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Sequence Setup
                        </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
                        Step 1: Actor Profile
                    </span>
                </div>

                {/* Biometric Face Mesh Visual Preview */}
                <div className="group relative my-4 flex aspect-[16/10] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-black/40 p-4 text-center transition-all hover:border-primary/40">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] shadow-inner shadow-black/50">
                        <ScanFace className="h-8 w-8 text-primary" />
                        {/* Target corner reticles */}
                        <span className="absolute -left-1 -top-1 h-2 w-2 border-l-2 border-t-2 border-primary" />
                        <span className="absolute -right-1 -top-1 h-2 w-2 border-r-2 border-t-2 border-primary" />
                        <span className="absolute -bottom-1 -left-1 h-2 w-2 border-b-2 border-l-2 border-primary" />
                        <span className="absolute -bottom-1 -right-1 h-2 w-2 border-b-2 border-r-2 border-primary" />
                    </div>
                    <span className="mt-3 text-xs font-bold uppercase tracking-wider text-white">
                        Actor Identity Unassigned
                    </span>
                    <span className="mt-1 max-w-[240px] text-[11px] leading-relaxed text-muted-foreground">
                        High-fidelity facial tracking and timeline synthesis requires at least 1 actor avatar.
                    </span>
                </div>

                <div className="space-y-2.5 text-xs text-muted-foreground">
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>Preserves facial likeness seamlessly across cuts and angle transitions</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>Synchronizes multi-track audio &amp; speech with actor head motion</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <span>Auto-stitches into unified 4K/1080p MP4 master timeline</span>
                    </div>
                </div>

                <div className="mt-5 pt-2">
                    <Button
                        asChild
                        size="lg"
                        className="w-full rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
                    >
                        <Link to="/user/avatar" className="flex items-center justify-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            <span>Create Primary Actor Avatar</span>
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
        );
    }

    // ── When user HAS avatars: Pro Multi-Track Sequence Config Panel ──
    return (
        <form
            onSubmit={handleSubmit}
            className="relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-card/80 via-card/50 to-black/80 p-5 shadow-2xl backdrop-blur-xl"
        >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 text-primary">
                        <Clapperboard className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                        New Sequence Project
                    </span>
                </div>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {avatars.length} {avatars.length === 1 ? "Actor Available" : "Actors Ready"}
                </span>
            </div>

            {/* Project Name */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <Label htmlFor="tpl-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Sequence Title
                    </Label>
                    <span className="text-[10px] text-muted-foreground">Required</span>
                </div>
                <Input
                    id="tpl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Cyberpunk Chase Reel"
                    className="h-9 border-white/10 bg-black/40 text-sm focus-visible:ring-primary"
                />
            </div>

            {/* Quick preset chips */}
            <div className="flex flex-wrap gap-1.5">
                {PRESET_NAMES.map((preset) => (
                    <button
                        key={preset}
                        type="button"
                        onClick={() => setName(preset)}
                        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-white/[0.06] hover:text-white"
                    >
                        + {preset}
                    </button>
                ))}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-desc" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Project Notes &amp; Concept
                </Label>
                <Textarea
                    id="tpl-desc"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Key story beats, soundtrack direction, or styling guidelines..."
                    className="resize-none border-white/10 bg-black/40 text-xs focus-visible:ring-primary"
                />
            </div>

            {/* Actor Casting Slots */}
            <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                <div className="mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                        Assigned Cast &amp; Actors
                    </span>
                    <Link
                        to="/user/avatar"
                        className="text-[10px] font-medium text-primary hover:underline"
                    >
                        + New Actor
                    </Link>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                    {/* Primary Actor */}
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                            Lead Actor (Slot 1)
                        </Label>
                        <Select value={avatar1} onValueChange={setAvatar1}>
                            <SelectTrigger className="h-8 border-white/10 bg-black/50 text-xs">
                                <SelectValue placeholder="Select lead" />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-card text-xs">
                                {avatars.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
                                                {a.name.slice(0, 1)}
                                            </span>
                                            <span>{a.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Secondary Actor */}
                    <div className="flex flex-col gap-1">
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                            Supporting (Slot 2)
                        </Label>
                        <Select value={avatar2} onValueChange={setAvatar2}>
                            <SelectTrigger className="h-8 border-white/10 bg-black/50 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-card text-xs">
                                <SelectItem value={NONE}>None</SelectItem>
                                {avatars.map((a) => (
                                    <SelectItem key={a.id} value={a.id}>
                                        <div className="flex items-center gap-2">
                                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/20 text-[9px] font-bold text-indigo-300">
                                                {a.name.slice(0, 1)}
                                            </span>
                                            <span>{a.name}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                    {error}
                </p>
            )}

            <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="mt-1 w-full rounded-xl bg-primary font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:shadow-primary/40"
            >
                {submitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <span>Initializing Sequence…</span>
                    </>
                ) : (
                    <span className="flex items-center justify-center gap-2">
                        <Clapperboard className="h-4 w-4" />
                        <span>Initialize Multi-Track Sequence</span>
                    </span>
                )}
            </Button>
        </form>
    );
}
