import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";

// Pages
import { LandingPage } from "./pages/LandingPage";
import { VideoPage } from "./pages/VideoPage";
import { ImagePage } from "./pages/ImagePage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { AvatarPage } from "./pages/AvatarPage";
import { GenerationPage } from "./pages/GenerationPage";
import { FaceSwapPage } from "./pages/FaceSwapPage";
import { AdminTemplateCreatePage } from "./pages/AdminTemplateCreatePage";
import { BillingPage } from "./pages/BillingPage";
import { LoginPage } from "./pages/LoginPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { RefundPage } from "./pages/RefundPage";

export default function App() {
    return (
        <BrowserRouter>
            <div className="flex min-h-screen flex-col bg-background text-foreground">
                <Navbar />
                <main className="flex-1">
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/video" element={<VideoPage />} />
                        <Route path="/image" element={<ImagePage />} />
                        <Route path="/user/templates" element={<TemplatesPage />} />
                        <Route path="/user/avatar" element={<AvatarPage />} />
                        <Route path="/user/generations" element={<GenerationPage />} />
                        <Route path="/faceswaps" element={<FaceSwapPage />} />
                        <Route path="/admin/template/create" element={<AdminTemplateCreatePage />} />
                        <Route path="/billing" element={<BillingPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/privacy" element={<PrivacyPage />} />
                        <Route path="/terms" element={<TermsPage />} />
                        <Route path="/refunds" element={<RefundPage />} />
                    </Routes>
                </main>
                <Footer />
            </div>
        </BrowserRouter>
    );
}
