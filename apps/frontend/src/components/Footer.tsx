import { Link } from "react-router-dom";

export function Footer() {
    return (
        <footer className="border-t border-white/10 py-6 text-center text-sm text-muted-foreground">
            <div className="flex justify-center gap-4">
                <Link to="/terms" className="hover:text-foreground">Terms</Link>
                <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
                <Link to="/refunds" className="hover:text-foreground">Refunds</Link>
            </div>
            <p className="mt-4">&copy; {new Date().getFullYear()} Pixovid. All rights reserved.</p>
        </footer>
    );
}
