import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createVideo } from "@/lib/api";
import type { Video } from "@/lib/api";

export function TextToVideoForm({ onCreated }: { onCreated: (video: Video) => void }) {
    const [prompt, setPrompt] = useState("");
    const [model, setModel] = useState("seedance-2.0-fast");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        const form = new FormData();
        form.set("prompt", prompt);
        form.set("model", model);
        
        try {
            const video = await createVideo(form);
            onCreated(video);
            setPrompt("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create video");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-card p-4">
            <h3 className="font-semibold text-lg">Generate Video</h3>
            
            {error && <p className="text-sm text-destructive">{error}</p>}
            
            <div className="flex flex-col gap-2">
                <Label htmlFor="model">Model</Label>
                <Select value={model} onValueChange={setModel}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="seedance-2.0-fast">Seedance 2.0 Fast</SelectItem>
                        <SelectItem value="seedance-2.0">Seedance 2.0</SelectItem>
                        <SelectItem value="kling-v3.0">Kling V3.0</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            
            <div className="flex flex-col gap-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea 
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your video..."
                    rows={4}
                    required
                />
            </div>
            
            <Button type="submit" disabled={loading || !prompt}>
                {loading ? "Generating..." : "Generate"}
            </Button>
        </form>
    );
}
