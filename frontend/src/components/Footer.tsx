import { Github, Linkedin, Zap, Heart } from "lucide-react";

export function Footer() {
    return (
        <footer className="border-t border-white/5 bg-slate-900/50 backdrop-blur-md mt-auto">
            <div className="container mx-auto px-6 py-8">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">

                    {/* Creator Info */}
                    <div className="flex flex-col items-center md:items-start gap-2">
                        <p className="text-slate-400 text-sm flex items-center gap-1.5">
                            Made with <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500/20" /> by <span className="text-slate-200 font-medium">Incari</span>
                        </p>
                        <div className="flex items-center gap-4">
                            <a
                                href="https://github.com/incari"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-white transition-colors flex items-center gap-1.5 text-xs"
                            >
                                <Github className="w-3.5 h-3.5" />
                                <span>GitHub</span>
                            </a>
                            <a
                                href="https://www.linkedin.com/in/racana/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-1.5 text-xs"
                            >
                                <Linkedin className="w-3.5 h-3.5" />
                                <span>LinkedIn</span>
                            </a>
                        </div>
                    </div>

                    {/* Promotion */}
                    <a
                        href="https://www.powerslug.app/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 bg-slate-800/50 hover:bg-slate-800 border border-white/5 hover:border-yellow-500/30 px-4 py-3 rounded-xl transition-all duration-300"
                    >
                        <div className="bg-yellow-500/10 p-2 rounded-lg group-hover:scale-110 transition-transform duration-300">
                            <Zap className="w-5 h-5 text-yellow-500" />
                        </div>
                        <div className="text-left">
                            <p className="text-slate-200 text-sm font-medium group-hover:text-yellow-400 transition-colors">
                                Try PowerSlug
                            </p>
                            <p className="text-slate-500 text-xs">
                                The best URL shortener
                            </p>
                        </div>
                    </a>

                </div>
            </div>
        </footer>
    );
}
