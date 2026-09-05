import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "@/lib/auth-client";
import {
    fetchTemplateRenders,
    fetchTemplates,
    type Template,
    type TemplateRender,
} from "@/lib/api";
import { TemplateGallery } from "@/components/TemplateGallery";
import { MyTemplateRenders } from "@/components/MyTemplateRenders";
import { SignedOut } from "@/components/SignedOut";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Sparkles, Wand2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Static reel templates (served from /public/showcase/templates)     */
/* ------------------------------------------------------------------ */

interface ReelTemplate {
    id: string;
    title: string;
    description: string;
    src: string;
    aspect: "portrait" | "landscape";
    duration: string;
    tags: string[];
}

const REEL_TEMPLATES: ReelTemplate[] = [
    {
        id: "reel-1",
        title: "Cinematic Intro",
        description:
            "A high-energy vertical reel with dramatic transitions — perfect for product launches or personal branding.",
        src: "/showcase/templates/template-1.mp4",
        aspect: "portrait",
        duration: "35s",
        tags: ["Trending", "Vertical"],
    },
    {
        id: "reel-2",
        title: "Vlog Montage",
        description:
            "A clean landscape montage template for travel vlogs, day-in-my-life content, or event recaps.",
        src: "/showcase/templates/template-2.mp4",
        aspect: "landscape",
        duration: "23s",
        tags: ["Vlog", "Widescreen"],
    },
    {
        id: "reel-3",
        title: "Story Highlight",
        description:
            "A punchy vertical reel designed for Instagram Stories and Reels — swap your face and go viral.",
        src: "/showcase/templates/template-3.mp4",
        aspect: "portrait",
        duration: "21s",
        tags: ["Reels", "Vertical"],
    },
];

/* ------------------------------------------------------------------ */
/*  Reel template card                                                 */
/* ------------------------------------------------------------------ */

function ReelTemplateCard({ tpl }: { tpl: ReelTemplate }) {
    const navigate = useNavigate();

    return (
        <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-card shadow-lg shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/40">
            {/* Video preview — unmutes on hover */}
            <div
                className={cn(
                    "relative overflow-hidden bg-black",
                    tpl.aspect === "portrait"
                        ? "aspect-[9/16] max-h-[420px]"
                        : "aspect-video",
                )}
            >
                <video
                    src={tpl.src}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => {
                        e.currentTarget.muted = false;
                        void e.currentTarget.play();
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.muted = true;
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />

                {/* Gradient scrim */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                {/* Tags */}
                <div className="absolute left-3 top-3 flex gap-1.5">
                    {tpl.tags.map((tag) => (
                        <span
                            key={tag}
                            className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground"
                        >
                            {tag}
                        </span>
                    ))}
                </div>

                {/* Duration */}
                <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                    {tpl.duration}
                </span>

                {/* Hover play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg">
                        <Play className="h-6 w-6" fill="currentColor" />
                    </span>
                </div>
            </div>

            {/* Info + CTAs */}
            <div className="flex flex-1 flex-col p-4">
                <h3 className="text-base font-bold">{tpl.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">
                    {tpl.description}
                </p>
                <div className="mt-3 flex gap-2">
                    <Button
                        size="sm"
                        className="flex-1 rounded-full text-xs"
                        onClick={() => navigate("/user/avatar")}
                    >
                        <Sparkles className="mr-1 h-3 w-3" />
                        Create with avatar
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={() =>
                            navigate(`/video?template=${encodeURIComponent(tpl.src)}`)
                        }
                    >
                        <Wand2 className="mr-1 h-3 w-3" />
                        Edit with AI
                    </Button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function TemplatesPage() {
    const { data: session, isPending } = useSession();
    const [tab, setTab] = useState<"browse" | "library">("browse");

    const [templates, setTemplates] = useState<Template[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);

    const [renders, setRenders] = useState<TemplateRender[]>([]);
    const [rendersLoading, setRendersLoading] = useState(false);
    const [rendersError, setRendersError] = useState<string | null>(null);

    const loadTemplates = useCallback(() => {
        setTemplatesLoading(true);
        setTemplatesError(null);
        fetchTemplates()
            .then(setTemplates)
            .catch((err) => setTemplatesError(err.message))
            .finally(() => setTemplatesLoading(false));
    }, []);

    const loadRenders = useCallback(() => {
        setRendersLoading(true);
        setRendersError(null);
        fetchTemplateRenders()
            .then(setRenders)
            .catch((err) => setRendersError(err.message))
            .finally(() => setRendersLoading(false));
    }, []);

    useEffect(() => {
        if (session?.user) loadTemplates();
    }, [session?.user, loadTemplates]);

    if (isPending) return null;
    if (!session?.user) return <SignedOut />;

    const tabClass = (active: boolean) =>
        cn(
            "-mb-px border-b-2 px-1 pb-2.5 text-sm font-semibold transition-colors",
            active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
        );

    return (
        <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
            {/* Hero */}
            <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-10">
                <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-brand-2/10 blur-3xl" />
                <span className="relative text-xs font-bold uppercase tracking-[0.22em] text-primary">
                    Templates
                </span>
                <h1 className="relative mt-2 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
                    Star in a <span className="text-primary">famous video</span>.
                </h1>
                <p className="relative mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                    Pick a template, choose your avatar, and we render you straight into
                    the scene — face, lighting and motion handled for you.
                </p>
            </div>

            {/* Tab bar */}
            <div className="mb-6 flex items-center gap-5 border-b border-white/[0.08]">
                <button
                    className={tabClass(tab === "browse")}
                    onClick={() => setTab("browse")}
                >
                    Browse templates
                </button>
                <button
                    className={tabClass(tab === "library")}
                    onClick={() => {
                        setTab("library");
                        loadRenders();
                    }}
                >
                    My renders
                </button>
            </div>

            <div className="min-h-[55vh]">
                {tab === "browse" ? (
                    <>
                        {/* ── Reel Templates (static, always visible) ── */}
                        <div className="mb-8">
                            <div className="mb-4 flex items-baseline gap-3">
                                <h2 className="text-xl font-bold tracking-tight">
                                    Reel{" "}
                                    <span className="text-primary">
                                        Templates
                                    </span>
                                </h2>
                                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                                    {REEL_TEMPLATES.length} ready
                                </span>
                            </div>
                            <p className="mb-5 max-w-xl text-sm text-muted-foreground">
                                Pre-made reels for Instagram, YouTube Shorts &
                                TikTok. Hover to preview with audio — then
                                create with your avatar or edit with AI.
                            </p>
                            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                {REEL_TEMPLATES.map((tpl) => (
                                    <ReelTemplateCard
                                        key={tpl.id}
                                        tpl={tpl}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* ── Divider ── */}
                        {templates.length > 0 && (
                            <div className="my-8 flex items-center gap-4">
                                <div className="h-px flex-1 bg-white/[0.08]" />
                                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                    AI-generated templates
                                </span>
                                <div className="h-px flex-1 bg-white/[0.08]" />
                            </div>
                        )}

                        {/* ── API templates (from admin) ── */}
                        <TemplateGallery
                            templates={templates}
                            loading={templatesLoading}
                            error={templatesError}
                            onRendered={(render) => {
                                setRenders((prev) => [render, ...prev]);
                                setTab("library");
                            }}
                        />
                    </>
                ) : (
                    <MyTemplateRenders
                        renders={renders}
                        loading={rendersLoading}
                        error={rendersError}
                    />
                )}
            </div>
        </div>
    );
}
