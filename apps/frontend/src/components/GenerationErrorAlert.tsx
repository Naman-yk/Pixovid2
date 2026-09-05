import { Link } from "react-router-dom";
import { AlertCircle, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
    error: string | null;
    className?: string;
}

export function GenerationErrorAlert({ error, className = "" }: Props) {
    if (!error) return null;

    return (
        <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive ${className}`}>
            <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
            </div>
            <Button asChild size="sm" variant="default" className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                <Link to="/billing" className="flex items-center gap-1.5">
                    <Coins className="h-4 w-4" /> Add Credits
                </Link>
            </Button>
        </div>
    );
}
