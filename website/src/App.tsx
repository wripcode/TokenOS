import { Navbar } from './components/sections/Navbar';
import { HeroSection } from './components/sections/HeroSection';
import { ProblemSection } from './components/sections/ProblemSection';
import { FeaturesSection } from './components/sections/FeaturesSection';
import { HowItWorksSection } from './components/sections/HowItWorksSection';
import { StatsSection } from './components/sections/StatsSection';
import { SupportedToolsSection } from './components/sections/SupportedToolsSection';
import { EmbeddingsSection } from './components/sections/EmbeddingsSection';
import { CTASection } from './components/sections/CTASection';
import { Footer } from './components/sections/Footer';
import { DottedBackground } from './components/ui/dotted-background';

function App() {
  return (
    <DottedBackground className="min-h-screen text-foreground antialiased selection:bg-[#fe6a01]/30 overflow-x-hidden">
      <Navbar />
      <main>
        <HeroSection />
        <ProblemSection />
        <FeaturesSection />
        <HowItWorksSection />
        <SupportedToolsSection />
        <EmbeddingsSection />
        <StatsSection />
        <CTASection />
      </main>
      <Footer />
    </DottedBackground>
  );
}

export default App;
