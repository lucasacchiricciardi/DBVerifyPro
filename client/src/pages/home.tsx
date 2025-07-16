import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import ConnectionForm from "@/components/connection-form";
import LoadingState from "@/components/loading-state";
import ResultsDisplay from "@/components/results-display";
import ErrorDisplay from "@/components/error-display";
import Header from "@/components/header";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { VerificationState } from "@/lib/types";

export default function Home() {
  const { t } = useTranslation();
  const [state, setState] = useState<VerificationState>({
    isLoading: false,
    result: null,
    error: null
  });

  const handleReset = () => {
    setState({
      isLoading: false,
      result: null,
      error: null
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main 
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8"
        role="main"
        aria-label="Database verification application"
      >
        {/* Loading state - announced to screen readers */}
        {state.isLoading && (
          <div role="status" aria-live="polite" aria-label="Verification in progress">
            <LoadingState />
          </div>
        )}

        {/* Connection form - main interface */}
        {!state.isLoading && !state.result && !state.error && (
          <section aria-label="Database connection configuration">
            <ConnectionForm setState={setState} />
          </section>
        )}

        {/* Results display - announced when completed */}
        {state.result && (
          <section 
            role="region" 
            aria-live="polite" 
            aria-label="Verification results"
            tabIndex={0}
          >
            <ResultsDisplay result={state.result} onReset={handleReset} />
          </section>
        )}

        {/* Error display - announced when errors occur */}
        {state.error && (
          <section 
            role="alert" 
            aria-live="assertive" 
            aria-label="Verification error"
            tabIndex={0}
          >
            <ErrorDisplay error={state.error} onRetry={handleReset} />
          </section>
        )}
      </main>

      {/* Footer - responsive and accessible */}
      <footer 
        className="bg-white border-t border-gray-200 mt-8 sm:mt-16"
        role="contentinfo"
        aria-label="Application footer"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="bg-primary rounded p-1" aria-hidden="true">
                <Database className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-gray-600 text-sm text-center sm:text-left">
                DB-Verify v1.0 - Database Migration Verification Tool
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4 text-sm text-gray-500">
              <span>Created by Luca Sacchi Riccardi</span>
              <span className="hidden sm:inline" aria-hidden="true">•</span>
              <a 
                href="mailto:luca.sacchi@gmail.com" 
                className="text-blue-600 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                aria-label="Send email to Luca Sacchi Riccardi"
              >
                luca.sacchi@gmail.com
              </a>
              <span className="hidden sm:inline" aria-hidden="true">•</span>
              <span>Licensed under CC BY-NC-ND 4.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
