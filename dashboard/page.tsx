'use client';

import { useState, useEffect, useRef } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015, github, atomOneDark, solarizedLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { saveApp, saveAppWithFullState, UserApp } from '@/utils/database/apps';
import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { generatePackageJson, generateReadme, generateVercelConfig, generateNetlifyConfig, generateGitIgnore } from '../../utils/projectGenerator';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import ConversationalPrompt from '@/components/ConversationalPrompt';

interface ProjectConfig {
  appName: string;
  appType: 'react' | 'next' | 'vue' | 'angular';
  hasRouting: boolean;
  hasStateManagement: boolean;
  hasAPI: boolean;
  dependencies: string[];
}

interface GenerateResponse {
  success: boolean;
  code: {
    frontend: string;
    backend: string;
    ui: string;
  };
  analysis: {
    components: string[];
    dependencies: string[];
    complexity: string;
  };
  metadata: {
    generatedAt: string;
    template: string;
    estimatedComponents: number;
  };
}


interface PreviewResponse {
  success: boolean;
  sandboxId: string;
  previewUrl: string;
  compiledCode: string;
  metadata: {
    componentName: string;
    compiledAt: string;
    dependencies: string[];
  };
}

interface SavedProject {
  id: string;
  name: string;
  prompt: string;
  componentName?: string;
  previewUrl?: string;
  createdAt?: string;
  
  // ✅ ADD: Missing properties for complete save/load
  app_name?: string;
  app_type?: string;
  generation_mode?: 'single' | 'multi';
  preview_url?: string; // Note: you have both previewUrl and preview_url
  prompt_analysis?: any;
  
  // ✅ ADD: Code-related properties
  generated_code?: string;
  code?: {
    frontend?: string;
    backend?: string;
    ui?: string;
    code?: {
      frontend?: string;
      backend?: string;
      ui?: string;
    };
  };
  
  // ✅ ADD: Multi-component properties
  components?: Array<{
    name: string;
    code: string;
    dependencies: string[];
    props?: string[]; 
  }>;
  project_files?: Record<string, string>;
  
  // ✅ ADD: App configuration
  app_options?: {
    includeRouting?: boolean;
    includeState?: boolean;
    includeAPI?: boolean;
  };
}

interface HistoryItem {
  id: string;
  prompt: string;
  result: GenerateResponse | null;
  timestamp: string;
  componentName: string;
}

// NEW: Multi-component interfaces
interface MultiComponentResponse {
  success: boolean;
  appType: string;
  isMultiComponent: boolean;
  components: Array<{
    name: string;
    code: string;
    dependencies: string[];
    props: string[];
  }>;
  projectFiles?: Record<string, string>; 
  structure: {
    hasRouting: boolean;
    hasStateManagement: boolean;
    hasApiIntegration: boolean;
    type: string;
    isMultiComponent?: boolean;  
  appType?: string;  
  };
  routes: Array<{
    path: string;
    component: string;
    title: string;
    description: string;
  }>;
  stateManagement: any;
  fileStructure: any[];
  appName?: string;  
  packageDependencies: string[];
  metadata: {
    generatedAt: string;
    componentCount: number;
    complexity: string;
    features: {
      routing: boolean;
      stateManagement: boolean;
      apiIntegration: boolean;
    };
  };
}

interface PromptAnalysis {
  isMultiComponent: boolean;
  appType: string;
  recommendedFeatures: {
    routing: boolean;
    stateManagement: boolean;
    apiIntegration: boolean;
  };
  estimatedComplexity: string;
  suggestedComponents: string[];
}

type DeviceView = 'desktop' | 'tablet' | 'mobile';
type PreviewTheme = 'light' | 'dark';
type GenerationMode = 'single' | 'multi';


export default function BitXDashboard() {
  
  const [viewMode, setViewMode] = useState<'preview' | 'code' | 'files'>('preview');
  const [showCodeView, setShowCodeView] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [previewUrl, setPreviewUrl] = useState('http://localhost:3005/preview');
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Save/Load functionality
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showProjectsPanel, setShowProjectsPanel] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [currentComponentName, setCurrentComponentName] = useState('');

  // NEW: Multi-component generation state
  const [isAnalyzingPrompt, setIsAnalyzingPrompt] = useState(false);
  const [promptAnalysis, setPromptAnalysis] = useState<PromptAnalysis | null>(null);
  const [generationMode, setGenerationMode] = useState<GenerationMode>('single');
  const [multiComponentResult, setMultiComponentResult] = useState<MultiComponentResponse | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [appOptions, setAppOptions] = useState({
    includeRouting: false,
    includeState: false,
    includeAPI: false
  });

  // Auto-save and session management
const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
const [lastSaved, setLastSaved] = useState<string | null>(null);
const [isDraftSaved, setIsDraftSaved] = useState(false);

  // Enhanced code view state
const [codeTheme, setCodeTheme] = useState<'vs2015' | 'github' | 'atomOneDark' | 'solarizedLight'>('vs2015');
const [activeCodeTab, setActiveCodeTab] = useState(0);
const [showCopySuccess, setShowCopySuccess] = useState(false);
const [codeSearchTerm, setCodeSearchTerm] = useState('');


  // Existing UX features state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showComparisonModal, setShowComparisonModal] = useState(false);
  const [comparisonProjects, setComparisonProjects] = useState<[SavedProject | null, SavedProject | null]>([null, null]);
  const [deviceView, setDeviceView] = useState<DeviceView>('desktop');
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>('light');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showPromptTemplates, setShowPromptTemplates] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ✅ ADD THIS NEW ERROR STATE for code validation
const [codeErrorState, setCodeErrorState] = useState({
  hasErrors: false,
  validation: null as any,
  canAutoFix: false,
  problematicComponents: [] as string[],
  originalPrompt: '',
  isFixing: false
});

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptAnalysisTimeout = useRef<NodeJS.Timeout | null>(null);
const [intentAnalysis, setIntentAnalysis] = useState<any>(null);
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState('preview');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
const [projectCredits, setProjectCredits] = useState<number>(0);
const [lastGenerationTime, setLastGenerationTime] = useState<number>(0);
const [loadedAppId, setLoadedAppId] = useState<string | null>(null);

  // Enhanced prompt templates with multi-component examples
  const promptTemplates = [
  { name: "Restaurant App", prompt: "Create a restaurant app where customers can browse the menu, add items to cart, customize orders, and pay online. Include categories like appetizers, mains, desserts." },
  { name: "Online Store", prompt: "Build an e-commerce website with product gallery, shopping cart, user accounts, wishlist, reviews, and secure checkout with Stripe payment." },
  { name: "Portfolio Website", prompt: "Design a personal portfolio with about me section, project showcase with images, skills, contact form, and social media links." },
  { name: "Blog Platform", prompt: "Create a blog website with post listings, individual post pages, categories, search functionality, author profiles, and comment system." },
  { name: "Task Manager", prompt: "Build a productivity app for managing tasks with add/edit/delete tasks, due dates, priority levels, categories, and progress tracking." },
  { name: "Real Estate Listings", prompt: "Create a property listing website with search filters, property details, image galleries, contact forms, and map integration." },
  { name: "Event Management", prompt: "Build an event planning app with event creation, RSVP system, guest list management, and calendar integration." },
  { name: "Recipe App", prompt: "Design a cooking app with recipe search, ingredients list, step-by-step instructions, cooking timers, and meal planning." },
  { name: "Social Media Feed", prompt: "Build a social media platform with user profiles, post creation, news feed, likes and comments, friend requests, and messaging system." },
  { name: "Learning Platform", prompt: "Create an online learning website with course listings, video lessons, quizzes, progress tracking, and certificates." }
];

// Add the downloadProject function
const downloadProject = async (multiComponentResult: any) => {
  if (!multiComponentResult || !multiComponentResult.projectFiles) {
    alert('No project files to download');
    return;
  }

  try {
    const zip = new JSZip();
    const appName = multiComponentResult.appName || 'my-bitx-app';
    
    // Create a folder for the project
    const projectFolder = zip.folder(appName);
    
    // Add all project files
    Object.entries(multiComponentResult.projectFiles).forEach(([filename, content]) => {
      if (content && projectFolder) {
        projectFolder.file(filename, content as string);
      }
    });

    // Add component files
    if (multiComponentResult.components) {
      const srcFolder = projectFolder?.folder('src');
      const componentsFolder = srcFolder?.folder('components');
      
      multiComponentResult.components.forEach((component: any, index: number) => {
        if (componentsFolder) {
          componentsFolder.file(`${component.name || `Component${index + 1}`}.jsx`, component.code);
        }
      });
    }

    // Generate and download ZIP
    const content = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    
    saveAs(content, `${appName}.zip`);
    console.log('✅ Project downloaded successfully!');
    
  } catch (error) {
    console.error('❌ Failed to create ZIP:', error);
    alert('Failed to download project. Please try again.');
  }
};

// Credits
// ✅ Replace your static state with this:
const [userCredits, setUserCredits] = useState({
  remaining: 10,        // Default for new users
  total: 10,
  plan: 'Free Plan'     // Default for new users
});

const syncCreditsGlobally = async () => {
  await fetchUserCredits(); // Your existing function
};

// ✅ Add useEffect to fetch real user data
useEffect(() => {
  fetchUserCredits();
}, []);

const fetchUserCredits = async () => {
  try {
    // Get current user ID (from Supabase auth or your auth system)
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.log('No authenticated user, keeping default credits');
      return; // Keep the default 10 free credits
    }
    
    const userId = user.id;
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/user/credits/${userId}`);
    const data = await response.json();
    
    if (data.success) {
      setUserCredits({ 
        remaining: data.credits.remaining,
        total: data.credits.total,
        plan: data.subscription.planName
      });
    }
  } catch (error) {
    console.error('Failed to fetch user credits:', error);
    // Keep default 10 free credits
  }
};



  // Device view dimensions
  const getDeviceDimensions = () => {
    switch (deviceView) {
      case 'mobile': return { width: '375px', height: '667px' };
      case 'tablet': return { width: '768px', height: '1024px' };
      default: return { width: '100%', height: '100%' };
    }
  };

  // Load data from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bitx-projects');
    if (saved) {
      setSavedProjects(JSON.parse(saved));
    }

    const savedHistory = localStorage.getItem('bitx-history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }

    // Check if first visit
    const hasVisited = localStorage.getItem('bitx-has-visited');
    if (!hasVisited) {
      setShowOnboarding(true);
      localStorage.setItem('bitx-has-visited', 'true');
    }
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('bitx-projects', JSON.stringify(savedProjects));
  }, [savedProjects]);

  useEffect(() => {
    localStorage.setItem('bitx-history', JSON.stringify(history));
  }, [history]);
  
  // ✅ ADD this useEffect to get the user
useEffect(() => {
  const checkUser = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/auth/login');
      return;
    }
    
    setUser(user);
    setLoading(false);
  };
  
  checkUser();
}, [router]);

// Add this useEffect after your existing useEffects in the dashboard
useEffect(() => {
  const loadAppFromUrl = async () => {
    // Get URL parameters using Web API (works in Next.js app router)
    const urlParams = new URLSearchParams(window.location.search);
    const loadId = urlParams.get('load');
    
    if (loadId && user) {
      console.log('🔄 Loading app from URL:', loadId);
      
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_apps')
        .select('*')
        .eq('id', loadId)
        .eq('user_id', user.id)
        .maybeSingle(); 
        
     if (data && !error) {
  console.log('📱 Found app to load:', data);
  
  // Restore the saved app state to dashboard
  setPrompt(data.prompt);
  setCurrentComponentName(data.component_name || data.name);
  setGenerationMode(data.generation_mode || 'single');
  setAppOptions(data.app_options || { includeRouting: false, includeState: false, includeAPI: false });
  setPromptAnalysis(data.prompt_analysis);
  setPreviewUrl(data.preview_url || 'http://localhost:3005/preview');
  
  // ✅ ENTERPRISE MULTI-COMPONENT LOADING
  if (data.components && data.is_multi_component) {
    console.log('🏢 Loading enterprise multi-component app');
    
    // Parse and clean enterprise components
    const savedComponents = typeof data.components === 'string' 
      ? JSON.parse(data.components) 
      : data.components;
      
    const cleanedComponents = savedComponents.map((comp: { code: string; }) => ({
      ...comp,
      code: comp.code
        .replace(/import.*from.*['"][^'"]*['"];?\n?/g, '')
        .replace(/import\s+{[^}]*}\s+from\s+['"][^'"]*['"];?\n?/g, '')
        .replace(/export\s+default\s+/g, '')
        .replace(/export\s+/g, '')
    }));
    
    const savedFileStructure = data.file_structure 
      ? (typeof data.file_structure === 'string' ? JSON.parse(data.file_structure) : data.file_structure)
      : [];
    
    const multiResult = {
      success: true,
      appType: data.app_type,
      isMultiComponent: true,
      components: cleanedComponents,
      structure: { 
        hasRouting: false, 
        hasStateManagement: false, 
        hasApiIntegration: false, 
        type: data.app_type 
      },
      routes: [],
      stateManagement: {},
      fileStructure: savedFileStructure,
      packageDependencies: ['react', 'react-dom', 'tailwindcss'],
      metadata: {
        generatedAt: data.created_at,
        componentCount: cleanedComponents.length,
        complexity: 'medium',
        features: { routing: false, stateManagement: false, apiIntegration: false }
      }
    };
    
    setMultiComponentResult(multiResult);
    setResult(null);
    console.log('✅ Enterprise multi-component app loaded with', cleanedComponents.length, 'components');
    
    // ✅ TRIGGER EXISTING PREVIEW GENERATION
console.log('🚀 Generating preview for loaded enterprise app...');

// Use existing preview generation function
setTimeout(async () => {
  try {
    const previewResponse = await fetch('http://localhost:3005/api/multi-component-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        components: cleanedComponents,
        appName: data.name || 'Enterprise App',
        fileStructure: savedFileStructure
      })
    });
    
    if (previewResponse.ok) {
      const result = await previewResponse.json();
      const freshPreviewUrl = `http://localhost:3005/preview/${result.previewId}`;
      console.log('✅ Fresh preview URL generated:', freshPreviewUrl);
      setPreviewUrl(freshPreviewUrl);
      
      // Trigger preview refresh in UI
      const event = new CustomEvent('previewRefresh', { detail: { url: freshPreviewUrl } });
      window.dispatchEvent(event);
    } else {
      console.error('❌ Preview generation failed:', await previewResponse.text());
    }
  } catch (error) {
    console.error('❌ Preview generation error:', error);
  }
}, 500); // Small delay to ensure components are set


  } else {
    // ✅ SINGLE COMPONENT LOADING (backward compatibility)
    console.log('📄 Loading single component app');
    const cleanCode = data.generated_code
      .replace(/import.*from.*['"][^'"]*['"];?\n?/g, '')
      .replace(/import\s+{[^}]*}\s+from\s+['"][^'"]*['"];?\n?/g, '')
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s+/g, '');
    
    const singleResult = {
      success: true,
      code: {
        frontend: cleanCode,
        backend: '',
        ui: ''
      },
      analysis: {
        components: [data.component_name || data.name],
        dependencies: [],
        complexity: 'medium'
      },
      metadata: {
        generatedAt: data.created_at,
        template: 'single',
        estimatedComponents: 1
      }
    };
    setResult(singleResult);
    setMultiComponentResult(null);
  }
  
  // Clear the URL parameter so refresh doesn't reload again
  window.history.replaceState({}, document.title, '/dashboard');
  console.log('✅ App loaded successfully - ready for editing!');
  
} else if (error) {
  console.error('❌ Error loading app:', error);
  alert('Error loading app. Please try again.');
}

    }
  };

  loadAppFromUrl();
}, [user]); // Trigger when user is available

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            if (prompt.trim() && !isGenerating) {
              generationMode === 'single' ? generateApp() : generateMultiComponentApp();
            }
            break;
          case 's':
            e.preventDefault();
            if ((result?.success || multiComponentResult?.success)) setShowSaveModal(true);
            break;
          case 'h':
            e.preventDefault();
            setShowHistoryPanel(true);
            break;
          case 'p':
            e.preventDefault();
            setShowProjectsPanel(true);
            break;
        }
      }
      if (e.key === 'Escape') {
        setShowSaveModal(false);
        setShowProjectsPanel(false);
        setShowHistoryPanel(false);
        setShowComparisonModal(false);
        setShowPromptTemplates(false);
        setShowExportMenu(false);
        setShowSuggestions(false);
        setIsFullScreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [prompt, isGenerating, result, multiComponentResult, generationMode]);

  // Force preview refresh when single component result changes
useEffect(() => {
  if (result?.success && result?.code?.frontend) {
    console.log('🔄 Triggering preview refresh for single component');
    const timestamp = Date.now();
    setPreviewUrl(`http://localhost:3005/preview?t=${timestamp}`);
  }
}, [result]);

// Force preview refresh when multi-component result changes  
useEffect(() => {
  if (multiComponentResult?.success) {
    console.log('🔄 Triggering preview refresh for multi-component');
    const timestamp = Date.now();
    setPreviewUrl(`http://localhost:3005/preview?t=${timestamp}`);
  }
}, [multiComponentResult]);

// Auto-save functionality (moved to component level)
const autoSaveSession = () => {
  if (autoSaveEnabled && prompt.trim()) {
    const sessionData = {
      prompt,
      generationMode,
      appOptions,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem('bitx-current-session', JSON.stringify(sessionData));
    setLastSaved(new Date().toLocaleTimeString());
    setIsDraftSaved(true);
    setTimeout(() => setIsDraftSaved(false), 2000);
  }
};

// Load project by ID function (moved to component level)
const loadProjectById = async (projectId: string) => {
  if (!user) return;
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_apps')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle(); 
    
  if (data) {
    await loadProject(data);
  }
};



// Enhanced copy functionality with success feedback (moved to component level)
const copyCodeWithFeedback = async (code: string, label: string = 'Code') => {
  try {
    await navigator.clipboard.writeText(code);
    setShowCopySuccess(true);
    setTimeout(() => setShowCopySuccess(false), 2000);
    console.log(`✅ ${label} copied to clipboard`);
  } catch (err) {
    console.error('❌ Failed to copy code:', err);
    alert('Failed to copy code. Please try again.');
  }
};

// ✅ Simple subscription check - uses your existing userCredits.plan
const hasSubscription = () => {
  return userCredits.plan !== 'No Subscription' && 
         userCredits.plan !== null && 
         userCredits.plan !== undefined &&
         userCredits.plan !== 'Free Plan';
};

// Search functionality for code (moved to component level)
const highlightSearchTerm = (code: string, searchTerm: string) => {
  const codeString = String(code || '');
  if (!searchTerm.trim()) return code;
  return codeString;
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return code.replace(regex, '**$1**'); // Simple highlight marker
};

// Prompt suggestions based on history (moved to component level)
const updatePromptSuggestions = (input: string) => {
  if (input.length < 2) {
    setShowSuggestions(false);
    return;
  }

  // Debounced auto-analysis
  // Skip prompt analysis for speed
setPromptAnalysis(null);


  const suggestions = history
    .filter(h => h.prompt.toLowerCase().includes(input.toLowerCase()))
    .map(h => h.prompt)
    .slice(0, 5);
  
  setPromptSuggestions(suggestions);
  setShowSuggestions(suggestions.length > 0);
};

// ✅ ALL useEffect HOOKS AT COMPONENT LEVEL:

// Load session on mount
useEffect(() => {
  const savedSession = localStorage.getItem('bitx-current-session');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session.prompt && !prompt) {
        setPrompt(session.prompt);
        setGenerationMode(session.generationMode || 'single');
        setAppOptions(session.appOptions || { includeRouting: false, includeState: false, includeAPI: false });
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }
}, []);

// Load project from URL parameters
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const loadId = urlParams.get('load');
  
  if (loadId && user) {
    loadProjectById(loadId);
  }
}, [user]);

// Auto-save when prompt changes
useEffect(() => {
  const autoSaveTimer = setTimeout(autoSaveSession, 3000);
  return () => clearTimeout(autoSaveTimer);
}, [prompt, generationMode, appOptions, autoSaveEnabled]);

// ✅ CLEAN analyzePrompt FUNCTION (NO HOOKS):
const analyzePrompt = async () => {
  if (!prompt.trim()) return;
  
  setIsAnalyzingPrompt(true);
  try {
    const response = await fetch('http://localhost:3001/api/analyze-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();
    if (data.success) {
      setPromptAnalysis(data.analysis);
      
      // Auto-suggest generation mode
      if (data.analysis?.isMultiComponent) {
        setGenerationMode('multi');
        setShowAdvancedOptions(true);
        
        // Auto-set recommended options
        setAppOptions({
          includeRouting: data.analysis.recommendedFeatures?.routing || false,
          includeState: data.analysis.recommendedFeatures?.stateManagement || false,
          includeAPI: data.analysis.recommendedFeatures?.apiIntegration || false
        });
      } else {
        setGenerationMode('single');
      }
    }
  } catch (error) {
    console.error('Prompt analysis failed:', error);
  } finally {
    setIsAnalyzingPrompt(false);
  }
};

  // Original single component generation
const generateApp = async () => {
  if (!prompt.trim()) return;

  const GENERATION_COST = 1;
  if (userCredits.remaining < GENERATION_COST) {
    alert(
      `Insufficient credits! You need ${GENERATION_COST} credits to build an app.\nYou have ${userCredits.remaining} remaining.`
    );
    return;
  }

  setIsGenerating(true);
  setIsGeneratingPreview(true);
  setError(null);
  setResult(null);
  setMultiComponentResult(null);

  try {
    const response = await fetch('http://localhost:3001/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    const data = await response.json();
    setResult(data);

    // Add to history
    const historyItem: HistoryItem = {
      id: Date.now().toString(),
      prompt: prompt,
      result: data,
      timestamp: new Date().toISOString(),
      componentName: '',
    };

    if (data.success && data.code.frontend) {
      // Credit deduction - FIXED VERSION
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const creditResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/user/credits/deduct`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                amount: GENERATION_COST,
                description: `App generation: ${prompt.substring(0, 50)}...`,
              }),
            }
          );

          const creditData = await creditResponse.json();
          if (creditData.success) {
            // Update credits from API response
            setUserCredits((prev) => ({
              ...prev,
              remaining: creditData.newBalance,
            }));

            // Sync credits globally
            await syncCreditsGlobally();
          }
        }
      } catch (error) {
        console.error('Failed to update credits:', error);
      }

      // Preview generation code
      // Preview generation code
try {
  const rawCode = data.code.frontend || '';
  const cleanCode = rawCode
    .replace(/```[a-z]*\n?/g, '') // ✅ remove markdown fences
    .replace(
      /^.*import\s+(\*\s+as\s+)?React.*from\s+['"]react['"];?.*$/gm,
      ''
    )
    .replace(
      /^.*import\s+React\s*,.*from\s+['"]react['"];?.*$/gm,
      ''
    )
    .replace(
      /^.*import\s*\{[^}]*React[^}]*\}.*from\s+['"]react['"];?.*$/gm,
      ''
    )
    .replace(/React\.FC\s*<[^>]*>/g, '() => JSX.Element')
    .replace(/React\.FC/g, '() => JSX.Element')
    .replace(/const className\s*=/g, '// const className =')
    .replace(/let className\s*=/g, '// let className =')
    .replace(/var className\s*=/g, '// var className =')
    .replace(/^\s*\n+/g, '') // remove leading blank lines
    .trim();

  if (!cleanCode) {
    setError("AI didn't return usable code.");
    setIsGenerating(false);
    return;
  }

        const componentMatch = cleanCode.match(
          /(?:const|function|class)\s+(\w+)(?:\s*[:=]|\s+extends)/
        );

        const actualComponentName = componentMatch
          ? componentMatch[1]
          : 'GeneratedComponent';

        setCurrentComponentName(actualComponentName);
        historyItem.componentName = actualComponentName;

        // ✅ ADD THIS BEFORE YOUR FETCH - Validate the code exists
console.log('🔍 DEBUGGING: cleanCode value:', cleanCode);
console.log('🔍 DEBUGGING: cleanCode type:', typeof cleanCode);

if (!cleanCode || cleanCode === 'undefined' || typeof cleanCode !== 'string') {
  console.error('❌ No valid code to preview:', cleanCode);
  setError('No code was generated to preview. Please try again.');
  setPreviewUrl('http://localhost:3005/preview');
  return; // ✅ Exit early, don't try to preview
}

// ✅ ADD LENGTH CHECK
if (cleanCode.trim().length < 10) {
  console.error('❌ Generated code too short:', cleanCode);
  setError('Generated code appears incomplete. Please try again.');
  setPreviewUrl('http://localhost:3005/preview');
  return;
}

        const previewResponse = await fetch(
          'http://localhost:3005/api/preview',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: `import React, { useState } from 'react';\n\n${cleanCode}\n\nexport default App;`,
              componentName: actualComponentName,
            }),
          }
        );

        if (!previewResponse.ok) {
    const errorText = await previewResponse.text();
    console.error('❌ Preview API error:', errorText);
    throw new Error(`Preview failed: ${previewResponse.status}`);
  }

        const previewData: PreviewResponse = await previewResponse.json();

        if (previewData.success) {
          setPreviewUrl(previewData.previewUrl);
        } else {
          setPreviewUrl('http://localhost:3005/preview');
          setError('Preview generation failed. Code generated successfully.');
        }
      } catch (previewError) {
        console.error('Preview service error:', previewError);
        setPreviewUrl('http://localhost:3005/preview');
        setError(
          'Preview service unavailable. Code generated successfully.'
        );
      }
    } else {
      setError('Generation failed. Please try a different prompt.');
    }

    // Save history (keep max 50 items)
    setHistory((prev) => [historyItem, ...prev.slice(0, 49)]);
  } catch (error) {
    console.error('Generation failed:', error);

    setError(
      'Network error. Please check your connection and try again.'
    );

    setResult({
      success: false,
      code: {
        frontend: `// Error: ${error}`,
        backend: '',
        ui: '',
      },
      analysis: {
        components: [],
        dependencies: [],
        complexity: 'error',
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        template: 'error',
        estimatedComponents: 0,
      },
    });
  } finally {
    setIsGenerating(false);
    setIsGeneratingPreview(false);
  }
};

  // NEW: Generate multi-component app

const generateMultiComponentApp = async () => {
  if (!prompt.trim()) return;

  const GENERATION_COST = 2; // Multi-component costs more
  if (userCredits.remaining < GENERATION_COST) {
    alert(
      `Insufficient credits! Multi-component apps need ${GENERATION_COST} credits.\nYou have ${userCredits.remaining} remaining.`
    );
    return;
  }

  setIsGenerating(true);
  setIsGeneratingPreview(true);
  setError(null);
  setResult(null);
  setMultiComponentResult(null);

  try {
    const response = await fetch('http://localhost:3001/api/generate-app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, options: appOptions }),
    });

    const data = await response.json();
    setMultiComponentResult(data);

    if (data.success) {

      const projectConfig = {
    appName: prompt.substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '') || 'my-app',
    appType: 'next' as const,
    hasRouting: appOptions.includeRouting,
    hasStateManagement: appOptions.includeState,
    hasAPI: appOptions.includeAPI,
    dependencies: ['tailwindcss']
  };

  const projectFiles = {
    'package.json': generatePackageJson(projectConfig),
    'README.md': generateReadme(projectConfig),
    'vercel.json': generateVercelConfig(projectConfig),
    'netlify.toml': generateNetlifyConfig(),
    '.gitignore': generateGitIgnore()
  };

  // Now safely update with declared variables
  setMultiComponentResult(prevState => ({
    ...prevState,
    ...data,
    projectFiles: projectFiles,
    isDeploymentReady: true
  }));
      // Credit deduction - FIXED VERSION
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const creditResponse = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/user/credits/deduct`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                amount: GENERATION_COST,
                description: `Multi-component app: ${prompt.substring(0, 50)}...`,
              }),
            }
          );

          const creditData = await creditResponse.json();
          if (creditData.success) {
            // Update credits from API response
            setUserCredits((prev) => ({
              ...prev,
              remaining: creditData.newBalance,
            }));

            // Sync credits globally
            await syncCreditsGlobally();
          }
        }
      } catch (error) {
        console.error('Failed to update credits:', error);
      }

      // Use first component for preview
      const mainComponent = data.components[0];
      if (mainComponent) {
        setCurrentComponentName(mainComponent.name);

        try {
          // ✅ Sanitize component code before preview
const rawCode = mainComponent.code || '';
const cleanCode = rawCode
  .replace(/```[a-z]*\n?/g, '')
  .trim();

if (!cleanCode) {
  setError("AI didn't return usable component code.");
  setIsGenerating(false);
  return;
}

const previewResponse = await fetch(
  'http://localhost:3005/api/preview',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: cleanCode,
      componentName: mainComponent.name,
    }),
  }
);


          const previewData = await previewResponse.json();
          if (previewData.success) {
            setPreviewUrl(previewData.previewUrl);
          } else {
            setError('Preview generation failed for multi-component app.');
          }
        } catch (previewError) {
          console.error('Preview generation failed:', previewError);
          setError('Preview service error for multi-component app.');
        }
      }

      // Add to history (convert to legacy format for compatibility)
      const historyItem: HistoryItem = {
        id: Date.now().toString(),
        prompt: prompt,
        result: {
          success: true,
          code: {
            frontend: mainComponent?.code || '// Multi-component app generated',
            backend: '// Backend code for multi-component app',
            ui: '// UI styles for multi-component app',
          },
          analysis: {
            components: data.components.map((c: { name: string }) => c.name),
            dependencies: data.packageDependencies,
            complexity: data.metadata.complexity,
          },
          metadata: {
            generatedAt: data.metadata.generatedAt,
            template: `multi-${data.appType}`,
            estimatedComponents: data.metadata.componentCount,
          },
        },
        timestamp: new Date().toISOString(),
        componentName: mainComponent?.name || 'MultiApp',
      };

      setHistory((prev) => [historyItem, ...prev.slice(0, 49)]);
    } else {
      setError('Multi-component generation failed. Please try again.');
    }
  } catch (error) {
    console.error('Multi-component generation failed:', error);
    setError('Multi-component generation failed. Please try again.');
  } finally {
    setIsGenerating(false);
    setIsGeneratingPreview(false);
  }
};


  // Smart auto-detection of generation mode
// ✅ FIXED: Works with your existing state structure
// ✅ FINAL FIXED VERSION - Matches your exact types
// ✅ ADD: Credit check and deduction for Smart Intent modifications
const handleSmartGeneration = async (chatPrompt: string) => {
  if (!chatPrompt.trim()) return;

  // ✅ STRONGER duplicate prevention - CHECK FIRST
  if (isGenerating) {
    console.log('🚫 BLOCKED: Already generating, ignoring duplicate request');
    return;
  }

  // ✅ IMPROVED rate limiting protection  
  const now = Date.now();
  const timeSinceLastGeneration = now - lastGenerationTime;
  const MIN_INTERVAL = 5000; // ✅ INCREASED to 5 seconds to prevent API rate limits

  if (timeSinceLastGeneration < MIN_INTERVAL) {
    const remainingTime = Math.ceil((MIN_INTERVAL - timeSinceLastGeneration) / 1000);
    console.log(`⚠️ Rate limiting: Please wait ${remainingTime} seconds before generating again`);
    setError(`Please wait ${remainingTime} seconds before generating again`);
    return;
  }

  setLastGenerationTime(now);

  // ✅ Credit validation
  const MIN_CREDITS = 1; 
  if (userCredits.remaining < MIN_CREDITS) {
    alert(`Insufficient credits! You need at least ${MIN_CREDITS} credits to modify this app.\nYou have ${userCredits.remaining} remaining.`);
    return;
  }

  // ✅ Set generating state IMMEDIATELY after all checks
  setIsGenerating(true);
  setError('');

  try {
    // ✅ CREATE PROJECT CONTEXT if missing
    let activeProjectId = currentProjectId;
    let activeProjectCredits = projectCredits;

    if (!activeProjectId) {
      activeProjectId = `project_${Date.now()}`;
      setCurrentProjectId(activeProjectId);
       if (!loadedAppId) {setLoadedAppId(null);}
      activeProjectCredits = 0;
      setProjectCredits(0);
      console.log('✅ Created new project:', activeProjectId);
    }

    // Get existing code for Smart Intent Engine context
    const existingCode = result?.code?.frontend || 
      (multiComponentResult?.components && multiComponentResult.components.length > 0 
        ? multiComponentResult.components.map((c: any) => c.code || '').join('\n\n') 
        : undefined);
    
    // ✅ DETECT REGENERATION for token allocation
    const regenerationTriggers = ['rebuild', 'recreate', 'start over', 'completely different', 'from scratch'];
    const isRegeneration = regenerationTriggers.some(trigger => 
      chatPrompt.toLowerCase().includes(trigger) 
    );
    
    console.log('🧠 Using Smart Intent Engine...', {
      hasExistingCode: !!existingCode,
      projectId: activeProjectId,
      projectCredits: activeProjectCredits,
      isRegeneration,
     prompt: chatPrompt.substring(0, 50) + '...'
    });

    // ✅ ADD THESE DEBUG LOGS
console.log('🔍 SMART INTENT INPUT PROMPT:', chatPrompt);
console.log('🔍 EXISTING CODE CONTEXT:', existingCode ? 'HAS CODE' : 'NO CODE');
console.log('🔍 PROJECT CONTEXT:', { activeProjectId, activeProjectCredits });
    
    // Use the Smart Intent Engine with COMPLETE project context
const smartResult = await fetch('http://localhost:3001/api/generate-smart', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: chatPrompt,
    timestamp: Date.now(),
    clearContext: true,
    existingCode: existingCode,
    useAdvancedGeneration: true,  // ✅ Make sure this is sent
    generateCompleteProject: true, // ✅ Make sure this is sent
    options: appOptions || {},     // ✅ Make sure this exists
    projectContext: {
      userId: user?.id,
      projectId: activeProjectId,
      projectCreditsUsed: activeProjectCredits
    },
    isRegeneration
  })
});

    
    const response = await smartResult.json();
    
    if (response.success) {
      // ✅ INCREMENT PROJECT CREDITS
      const newProjectCredits = activeProjectCredits + 1;
      setProjectCredits(newProjectCredits);
      
      const strategy = response.analysis?.executionPlan?.strategy;
      
      console.log('🎯 Smart Intent Result:', {
        strategy: strategy,
        intent: response.analysis?.intent,
        tokensUsed: response.analysis?.estimatedTokens,
        tokenLimit: response.analysis?.tokenAllocation?.tokenLimit,
        creditNumber: newProjectCredits,
        isRegeneration,
        reasoning: response.analysis?.tokenAllocation?.reasoning
      });

      // ✅ ADD THESE DEBUG LOGS
console.log('🔍 AI RESPONSE DATA:', response.data);
console.log('🔍 AI RESPONSE FRONTEND CODE:', response.data?.frontend?.substring(0, 100) + '...');
console.log('🔍 AI RESPONSE COMPONENTS:', response.data?.components);

// ✅ ADD THESE DEBUG LINES
console.log('🚨 FRONTEND: Full response structure:', JSON.stringify(response, null, 2));
console.log('🚨 FRONTEND: response.data keys:', Object.keys(response.data || {}));
console.log('🚨 FRONTEND: First component:', response.data?.components?.[0]);

// ✅ Try alternative data paths
const extractedCode = 
  response.data?.code?.frontend ||           // Old single-component path
  response.data?.components?.[0]?.code ||    // New multi-component path
  response.data?.frontend ||                 // Direct path
  null;

  console.log('🚨 FRONTEND: Extracted frontend code length:', extractedCode?.length || 0);
  
// ✅ Try alternative data paths
const frontendCode = 
  response.data?.code?.frontend ||           // Old single-component path
  response.data?.components?.[0]?.code ||    // New multi-component path
  'NO CODE FOUND';

console.log('🚨 FRONTEND: Extracted frontend code length:', frontendCode?.length || 0);

      // ✅ DEDUCT CREDITS - ONLY ONCE per successful generation
      try {
        const creditResponse = await fetch('http://localhost:3001/api/user/credits/deduct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id,
            amount: 1,
            description: `${isRegeneration ? 'Project regeneration' : 'Smart Intent modification'}: Credit ${newProjectCredits}`
          })
        });

        const creditResult = await creditResponse.json();
        
        if (creditResult.success) {
          setUserCredits(prev => ({
            ...prev,
            remaining: creditResult.newBalance
          }));
          
          console.log(`💰 Deducted 1 credit for ${isRegeneration ? 'regeneration' : 'Smart Intent modification'}. New balance: ${creditResult.newBalance}`);
        } else {
          console.error('❌ Failed to deduct credits:', creditResult.error);
        }
      } catch (creditError) {
        console.error('❌ Credit deduction request failed:', creditError);
      }

      // ✅ HANDLE RESULTS - Route based on Smart Intent Engine decision
      if (strategy === 'targeted_modification' || strategy === 'partial_rebuild') {
  // ✅ Clean the AI output before preview
  const rawCode =
  response.data.frontend ||
  response.data.code ||
  response.output_text ||      // ✅ fallback
  '';

  const cleanCode = rawCode
    .replace(/```[a-z]*\n?/g, '') // strip markdown fences
    .trim();

  if (!cleanCode) {
    setError("AI didn't return usable frontend code.");
    setIsGenerating(false);
    return;
  }
        // Single component result for modifications
        const newResult = {
          success: true,
          code: {
            frontend: response.data.frontend || response.data.code || response.data.components?.[0]?.code || '',
            backend: '',
            ui: ''
          },
          analysis: {
            components: response.data.components || ['Modified'],
            dependencies: ['Tailwind CSS'],
            complexity: isRegeneration ? 'Smart Regeneration' : 'Smart Modification'
          },
          metadata: {
            generatedAt: new Date().toISOString(),
            template: isRegeneration ? 'smart-regeneration' : 'smart-modification',
            estimatedComponents: (response.data.components || ['Modified']).length,
            tokenAllocation: response.analysis?.tokenAllocation
          }
        };
        
        setResult(newResult);
        setMultiComponentResult(null);
        
       // ✅ Force preview refresh
  const ts = Date.now();

  // After posting to /api/preview
const previewResponse = await fetch('http://localhost:3005/api/preview', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: cleanCode, componentName: 'GeneratedComponent' })
});
const previewData = await previewResponse.json();

if (previewData?.success && previewData.previewUrl) {
  setPreviewUrl(previewData.previewUrl); // ✅ correct sandbox URL
  console.log('✅ Preview ready at:', previewData.previewUrl);
  return `✅ Done — preview created at ${previewData.previewUrl}`;
} else {
  setPreviewUrl(`http://localhost:3005/preview`);
  console.warn('⚠️ Preview fallback to default landing page');
  return '⚠️ Preview fallback loaded.';
}

  console.log('🔄 Updating single component preview');
        
      } else if (response.data.components && response.data.components.length > 1) {
        // Multi-component result
        const newMultiResult = {
          success: true,
          isMultiComponent: true,
          appType: response.analysis?.intent === 'REBUILD' ? 'rebuilt-app' : 'full-app',
          components: response.data.components || [],
          structure: {
            hasRouting: response.data.structure?.hasRouting || false,
            hasStateManagement: response.data.structure?.hasStateManagement || false,
            hasApiIntegration: response.data.structure?.hasApiIntegration || false,
            type: 'full-app',
            isMultiComponent: true,
            appType: 'full-app'
          },
          routes: response.data.routes || [],
          stateManagement: response.data.stateManagement || null,
          fileStructure: response.data.fileStructure || [],
          packageDependencies: response.data.packageDependencies || ['react', '@types/react', 'tailwindcss'],
          metadata: {
            generatedAt: new Date().toISOString(),
            componentCount: (response.data.components || []).length,
            complexity: isRegeneration ? 'Smart Regeneration' : 'Smart Generation',
            features: {
              routing: response.data.structure?.hasRouting || false,
              stateManagement: response.data.structure?.hasStateManagement || false,
              apiIntegration: response.data.structure?.hasApiIntegration || false
            },
            tokenAllocation: response.analysis?.tokenAllocation
          }
        };
        
        setMultiComponentResult(newMultiResult);
        setResult(null);
        
        console.log('🔄 Updating multi-component preview');
          // ✅ Send to preview-builder (multi-component)
  const previewResponse = await fetch('http://localhost:3005/api/preview-app', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      components: response.data.components,
      routes: response.data.routes || [],
      stateManagement: response.data.stateManagement || null,
      packageDependencies: response.data.packageDependencies || ['react', 'react-dom'],
      appType: 'multi-component-app'
    })
  });
  const previewData = await previewResponse.json();

  if (previewData?.success && previewData.previewUrl) {
    setPreviewUrl(previewData.previewUrl);
    console.log('✅ Multi-component preview ready at:', previewData.previewUrl);
  } else {
    console.warn('⚠️ Multi-component preview fallback');
    setPreviewUrl(`http://localhost:3005/preview`);
  }

      } else {
        // Single component result
        const newResult = {
          success: true,
          code: {
            frontend: response.data.frontend || response.data.code || response.data,
            backend: '',
            ui: ''
          },
          analysis: {
            components: ['Generated'],
            dependencies: ['Tailwind CSS'],
            complexity: isRegeneration ? 'Smart Regeneration' : 'Smart Generation'
          },
          metadata: {
            generatedAt: new Date().toISOString(),
            template: isRegeneration ? 'smart-regeneration' : 'smart-generation',
            estimatedComponents: 1,
            tokenAllocation: response.analysis?.tokenAllocation
          }
        };
        
        setResult(newResult);
        setMultiComponentResult(null);
        
        console.log('🔄 Updating single result preview');
      }

      console.log('✅ Smart Generation completed successfully');

// ✅ NEW: Check for validation errors in the response
// Check for validation errors OR empty components
if ((response.validation && response.validation.hasErrors) || 
    (response.data && response.data.components && response.data.components.length === 0)) {

  console.log('⚠️ DASHBOARD: Code errors detected:', response.validation);
  
  // Set error state for UI to show fix options
  setCodeErrorState({
    hasErrors: true,
    validation: response.validation,
    canAutoFix: response.analysis?.canAutoFix || false,
    problematicComponents: response.analysis?.problematicComponents || [],
    originalPrompt: chatPrompt,
    isFixing: false
  });
} else {
  console.log('✅ DASHBOARD: No errors detected, clean generation');
  
  // Clear any previous error state
  setCodeErrorState({
    hasErrors: false,
    validation: null,
    canAutoFix: false,
    problematicComponents: [],
    originalPrompt: '',
    isFixing: false
  });
}
      
    } else {
      throw new Error(response.error || 'Smart generation failed');
    }
    
  // ✅ Send to preview-builder (single component)
  const rawCode = response.data.frontend || response.data.code || '';
  const cleanCode = rawCode.replace(/```[a-z]*\n?/g, '').trim();

  const previewResponse = await fetch('http://localhost:3005/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: cleanCode, componentName: 'GeneratedComponent' })
  });
  const previewData = await previewResponse.json();

  if (previewData?.success && previewData.previewUrl) {
    setPreviewUrl(previewData.previewUrl);
    console.log('✅ Single-component preview ready at:', previewData.previewUrl);
  } else {
    console.warn('⚠️ Single-component preview fallback');
    setPreviewUrl(`http://localhost:3005/preview`);
  }

  } catch (error) {
    console.error('❌ Smart generation error:', error);
    
    // ✅ IMPROVED ERROR HANDLING - Show user-friendly message, NO FALLBACK
   let errorMessage = 'Generation failed. Please try again with a different prompt.';
  
  if (error instanceof Error) {
    // It's a proper Error object
    if (error.message.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please wait a few minutes before trying again.';
    } else if (error.message.includes('credits')) {
      errorMessage = 'Insufficient credits for this operation.';
    } else {
      errorMessage = `Generation failed: ${error.message}`;
    }
  } else if (typeof error === 'string') {
    // Error is a string
    if (error.includes('429')) {
      errorMessage = 'Rate limit exceeded. Please wait a few minutes before trying again.';
    } else if (error.includes('credits')) {
      errorMessage = 'Insufficient credits for this operation.';
    } else {
      errorMessage = `Generation failed: ${error}`;
    }
  } else {
    // Unknown error type
    errorMessage = 'An unexpected error occurred. Please try again.';
  }
  
  setError(errorMessage);
    
    // ✅ REMOVED FALLBACK - This prevents double credit charges
    // DO NOT call generateMultiComponentApp() or generateApp() here
    
  } finally {
    setIsGenerating(false); // ✅ ALWAYS reset generating state
  }
  return null;
};

// ✅ AI Chat handler (conversational responses)
const handleChatMessage = async (chatPrompt: string): Promise<string | null> => {
  console.log('💬 Chat prompt received:', chatPrompt);

  // ✅ ADD THESE DEBUG LOGS
  console.log('🔍 EXACT PROMPT BEING SENT TO AI:', chatPrompt);
  console.log('🔍 CURRENT RESULT STATE:', result);
  console.log('🔍 CURRENT MULTI-COMPONENT STATE:', multiComponentResult);

  try {
    const res = await fetch('http://localhost:3001/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: chatPrompt })
    });

    const data = await res.json();

    // If AI decides this is a build request, trigger generation
    if (data.intent === 'generate_app') {
      await handleSmartGeneration(chatPrompt); // background app build
    }

    return data.reply || "I'm here to help!";
  } catch (err) {
    console.error("Chat error:", err);
    return "❌ Sorry, I couldn't process that.";
  }
};


// ✅ ADD THIS NEW FUNCTION for chat integration
// ✅ Explicitly return Promise<string|null>
const handleChatGeneration = async (chatPrompt: string): Promise<string | null> => {
  console.log('💬 Chat prompt received:', chatPrompt);

  if (isGenerating) {
    console.log('🚫 Chat blocked: Already generating');
    return 'Already generating — please wait a moment.';
  }

  setIsGenerating(true); // ✅ mark as generating
  setPrompt(chatPrompt);
  setError(null);

  try {
    // Call smart generation
    const reply = await handleSmartGeneration(chatPrompt);

    // If previewUrl exists, return a success message; otherwise return the AI reply
    if (previewUrl) {
      return `✅ Done — preview created at ${previewUrl}`;
    }

    return reply || '✅ Generation completed';
  } catch (err: any) {
    console.error('Smart generation error:', err);
    setError(err?.message || 'Generation failed');
    return `❌ Generation failed: ${err?.message || 'unknown error'}`;
  } finally {
    setIsGenerating(false);
  }
};


  // Save project (enhanced for multi-component)
  const saveProject = () => {
  if ((!result && !multiComponentResult) || !projectName.trim()) return;

  // ✅ ADD THESE DEBUG LOGS
  console.log('🚨 SAVE DEBUG: currentProjectId:', currentProjectId);
  console.log('🚨 SAVE DEBUG: savedProjects:', savedProjects.map(p => ({ id: p.id, name: p.name })));

  // ✅ Use currentProjectId to find existing project
  const existingProjectIndex = savedProjects.findIndex(p => p.id === currentProjectId);
  
 console.log('🚨 SAVE DEBUG: existingProjectIndex:', existingProjectIndex);
  console.log('🚨 SAVE DEBUG: Will', existingProjectIndex >= 0 ? 'UPDATE' : 'CREATE');

  const projectData: SavedProject = {
    id: currentProjectId || Date.now().toString(), // ✅ Use current project ID instead of new timestamp
    name: projectName,
    prompt: prompt,
    code: result || {
      success: true,
      code: {
        frontend: multiComponentResult?.components[0]?.code || '// Multi-component app',
        backend: '// Multi-component backend',
        ui: '// Multi-component UI'
      },
      analysis: {
        components: multiComponentResult?.components.map(c => c.name) || [],
        dependencies: multiComponentResult?.packageDependencies || [],
        complexity: multiComponentResult?.metadata.complexity || 'multi'
      },
      metadata: {
        generatedAt: multiComponentResult?.metadata.generatedAt || new Date().toISOString(),
        template: `multi-${multiComponentResult?.appType}` || 'multi-app',
        estimatedComponents: multiComponentResult?.metadata.componentCount || 1
      }
    },
    previewUrl: previewUrl,
    createdAt: existingProjectIndex >= 0 ? savedProjects[existingProjectIndex].createdAt : new Date().toISOString(), // ✅ Keep original creation date
    componentName: currentComponentName,
  };

  if (existingProjectIndex >= 0) {
    // ✅ UPDATE existing project (same project ID)
    setSavedProjects(prev => 
      prev.map((p, index) => 
        index === existingProjectIndex ? projectData : p
      )
    );
     console.log('✅ Updated existing project:', projectData.name, 'ID:', projectData.id);
    // ✅ CREATE new project (only when project ID doesn't exist)
    setSavedProjects(prev => [projectData, ...prev]);
    console.log('✅ Created new project:', projectData.name, 'ID:', projectData.id);
  }

  setProjectName('');
  setShowSaveModal(false);
};

  // Load project
  // ✅ Change from UserApp to SavedProject
const loadProject = async (project: SavedProject) => {
  try {
    console.log('🔄 Loading saved project:', project.name);
    
     setLoadedAppId(project.id);

    // Clear any existing errors
    setError(null);
    
    // ✅ RESTORE: All project settings with proper type handling
    setPrompt(project.prompt || '');
    setCurrentComponentName(project.componentName || project.app_name || 'Generated Component');
    setGenerationMode((project.generation_mode as 'single' | 'multi') || 'single');
    
    // ✅ FIX: Ensure all boolean values are defined
    setAppOptions({
      includeRouting: project.app_options?.includeRouting ?? false,
      includeState: project.app_options?.includeState ?? false,
      includeAPI: project.app_options?.includeAPI ?? false
    });
    
    setPromptAnalysis(project.prompt_analysis || null);
    
    // ✅ RESTORE: Check if this is a multi-component project
    // ✅ NEW SAFE VERSION:
if (project.components || project.project_files) {
  // Parse components safely - they might be stored as JSON string
  let parsedComponents = [];
  
  if (project.components) {
    if (typeof project.components === 'string') {
      try {
        parsedComponents = JSON.parse(project.components);
      } catch (e) {
        console.warn('⚠️ Failed to parse components JSON:', e);
        parsedComponents = [];
      }
    } else if (Array.isArray(project.components)) {
      parsedComponents = project.components;
    }
  }
  
  const multiResult: MultiComponentResponse = {
    success: true,
    appName: project.app_name || project.name,
    components: parsedComponents.map((comp: { name: any; code: any; dependencies: any; props: any; }) => ({
      name: comp.name || 'Component',
      code: comp.code || '',
      dependencies: comp.dependencies || [],
      props: comp.props || []
    })),

        projectFiles: project.project_files || {},
        structure: {
          isMultiComponent: true,
          hasRouting: project.app_options?.includeRouting ?? false,
          hasStateManagement: project.app_options?.includeState ?? false,
          hasApiIntegration: project.app_options?.includeAPI ?? false,
          appType: project.app_type || 'full-app',
          type: project.app_type || 'full-app'
        },
        appType: '',
        isMultiComponent: false,
        routes: [],
        stateManagement: undefined,
        fileStructure: [],
        packageDependencies: [],
        metadata: {
          generatedAt: '',
          componentCount: 0,
          complexity: '',
          features: {
            routing: false,
            stateManagement: false,
            apiIntegration: false
          }
        }
      };
      
      setMultiComponentResult(multiResult);
      setResult(null);
      
      // 🔥 NEW: Generate fresh preview for multi-component
      const mainComponent = multiResult.components[0];
      if (mainComponent) {
        try {
          setIsGeneratingPreview(true);
          const previewResponse = await fetch('http://localhost:3005/api/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: mainComponent.code,
              componentName: mainComponent.name,
              forceNew: true
            }),
          });

          const previewData = await previewResponse.json();
          if (previewData.success) {
            setPreviewUrl(previewData.previewUrl);
            console.log('✅ Fresh preview generated:', previewData.previewUrl);
          } else {
            setError('Failed to generate preview for loaded project');
          }
        } catch (error) {
          console.error('Preview generation failed:', error);
          setError('Failed to generate preview for loaded project');
        } finally {
          setIsGeneratingPreview(false);
        }
      }
      
      console.log('✅ Multi-component project restored with files');
    } else {
      // Single component project
      const frontendCode = typeof project.generated_code === 'string' ? project.generated_code :
                          project.code?.code?.frontend || 
                          project.code?.frontend || '';
      
      const backendCode = project.code?.code?.backend || project.code?.backend || '';
      const uiCode = project.code?.code?.ui || project.code?.ui || '';
      
      if (frontendCode) {
        const singleResult: GenerateResponse = {
          success: true,
          code: {
            frontend: frontendCode,
            backend: backendCode,
            ui: uiCode,
          },
          analysis: {
            components: [project.componentName || 'Generated Component'],
            dependencies: [],
            complexity: 'medium',
          },
          metadata: {
            generatedAt: project.createdAt || new Date().toISOString(),
            template: 'single',
            estimatedComponents: 1,
          },
        };
        
        setResult(singleResult);
        setMultiComponentResult(null);
        
        // 🔥 NEW: Generate fresh preview for single component
        try {
          setIsGeneratingPreview(true);
          const previewResponse = await fetch('http://localhost:3005/api/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: frontendCode,
              componentName: project.componentName || 'Generated Component',
              forceNew: true
            }),
          });

          const previewData = await previewResponse.json();
          if (previewData.success) {
            setPreviewUrl(previewData.previewUrl);
            console.log('✅ Fresh preview generated:', previewData.previewUrl);
          } else {
            setError('Failed to generate preview for loaded project');
          }
        } catch (error) {
          console.error('Preview generation failed:', error);
          setError('Failed to generate preview for loaded project');
        } finally {
          setIsGeneratingPreview(false);
        }
        
        console.log('✅ Single component project restored');
      }
    }
    
    setShowProjectsPanel(false);
    setShowHistoryPanel(false);
    console.log('✅ Project loaded successfully - Fresh preview generated!');
    
  } catch (error) {
    console.error('❌ Error loading project:', error);
    alert('Error loading project. Please try again.');
  }
};



  // Load from history
  const loadFromHistory = (historyItem: HistoryItem) => {
    setPrompt(historyItem.prompt);
    if (historyItem.result) {
      setResult(historyItem.result);
      setCurrentComponentName(historyItem.componentName);
    }
    setMultiComponentResult(null);
    setShowHistoryPanel(false);
  };

  // Delete project
  const deleteProject = (projectId: string) => {
    setSavedProjects(prev => prev.filter(p => p.id !== projectId));
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Code copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Download as file
  const downloadCode = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Use template
  const useTemplate = (templatePrompt: string) => {
    setPrompt(templatePrompt);
    setShowPromptTemplates(false);
    textareaRef.current?.focus();
  };
    // Save Funcationality
  const handleSaveApp = async () => {
  if (!result && !multiComponentResult) {
    alert('No app to save. Generate an app first.');
    return;
  }
  
  console.log('🚀 Starting save process...');
  
  let generatedCode = '';
  if (result?.code?.frontend) {
    generatedCode = result.code.frontend;
  } else if (multiComponentResult?.components?.[0]?.code) {
    generatedCode = multiComponentResult.components[0].code;
  }
  
  if (!generatedCode) {
    alert('No generated code to save.');
    return;
  }
  
 const appData = {
  id: loadedAppId || undefined,
  name: currentComponentName || 'Untitled App',
  description: prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt,
  app_type: promptAnalysis?.appType || 'website',
  prompt: prompt,
  generated_code: generatedCode,
  // ✅ USE EXISTING STATE VARIABLES:
  components: multiComponentResult?.components || [],
  file_structure: multiComponentResult?.fileStructure || [],
  is_multi_component: !!(multiComponentResult?.components && multiComponentResult.components.length > 1),
  frontend_code: result?.code?.frontend || multiComponentResult?.components?.[0]?.code || generatedCode,
  prompt_analysis: promptAnalysis,
  generation_mode: generationMode || 'single',
  app_options: appOptions || {},
  component_name: currentComponentName,
  preview_url: previewUrl,
  preview_image: undefined
};



  console.log('📋 Attempting to save:', appData);
  console.log('🔍 App ID for save:', appData.id);
  
  const { data, error } = await saveAppWithFullState(appData);
  
  if (error) {
    console.error('❌ Save failed:', error);
    alert(`Save failed: ${error?.message || 'Unknown error'}`);
  } else {
    console.log('✅ Save successful:', data);
    // ✅ Update loadedAppId for future saves
    if (data?.id && !loadedAppId) {
      setLoadedAppId(data.id);
    }
    alert('App saved successfully!');
    setShowSaveModal(false);
  }
};

// ✅ ADD THIS NEW FUNCTION after your existing handlers
const handleFixCodeErrors = async () => {
  if (!codeErrorState.hasErrors || !codeErrorState.validation) return;
  
  setCodeErrorState(prev => ({ ...prev, isFixing: true }));
  console.log('🔧 DASHBOARD: Starting error fix process');
  
  try {
    const response = await fetch('http://localhost:3001/api/fix-errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: currentProjectId,
        componentsToFix: codeErrorState.problematicComponents,
        originalPrompt: codeErrorState.originalPrompt,
        workingComponents: [],
        validationErrors: codeErrorState.validation.errors
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ DASHBOARD: Errors fixed successfully');
      
      // Update with fixed code
      if (result.data.components && result.data.components.length > 0) {
        const fixedCode = result.data.components[0]?.code || '';
        
        // Update the appropriate result based on current mode
        if (multiComponentResult) {
          // Update multi-component result
          const updatedComponents = [...(multiComponentResult.components || [])];
          if (updatedComponents[0]) {
            updatedComponents[0] = { ...updatedComponents[0], code: fixedCode };
          }
          
          setMultiComponentResult(prev => prev ? {
            ...prev,
            components: updatedComponents
          } : null);
        } else if (result) {
          // Update single component result
          setResult(prev => prev ? {
            ...prev,
            code: { ...prev.code, frontend: fixedCode }
          } : null);
        }
        
        // Trigger preview refresh
        const timestamp = Date.now();
        setPreviewUrl(`http://localhost:3005/preview?t=${timestamp}`);
        
        // Clear error state
        setCodeErrorState({
          hasErrors: false,
          validation: null,
          canAutoFix: false,
          problematicComponents: [],
          originalPrompt: '',
          isFixing: false
        });
        
        // Show success message in your existing style
        setError(null); // Clear any existing errors
        
        // Optional: Add a subtle success indicator
        setTimeout(() => {
          console.log('✅ Code errors fixed successfully! No credit deducted.');
        }, 100);
      }
      
    } else {
      console.error('❌ DASHBOARD: Error fix failed:', result.error);
      setError('Failed to fix code errors. Please try regenerating.');
    }
    
  } catch (error) {
    console.error('❌ DASHBOARD: Error in handleFixCodeErrors:', error);
    setError('Network error while fixing issues. Please try again.');
  } finally {
    setCodeErrorState(prev => ({ ...prev, isFixing: false }));
  }
};

 
// Add this function for testing
const testDatabaseConnection = async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  console.log('🧪 Testing database connection...');
  console.log('👤 Current user:', user);
  
  if (!user) {
    alert('Not logged in!');
    return;
  }

  // Test simple insert
  const { data, error } = await supabase
    .from('user_apps')
    .insert({
      user_id: user.id,
      name: 'Test App',
      app_type: 'website',
      prompt: 'Test prompt',
      generated_code: 'console.log("Hello World");'
    })
    .select();

  if (error) {
    console.error('❌ Test failed:', error);
    alert(`Test failed: ${error.message}`);
  } else {
    console.log('✅ Test passed:', data);
    alert('Database connection works!');
  }
};

  return (
    
   <div className={`flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100 ${isFullScreen ? 'fixed inset-0 z-50' : ''} overflow-hidden`}>

     {/* Left Panel */}
<div className={`${isFullScreen ? 'hidden' : 'w-1/4'} bg-white p-4 border-r border-gray-100 flex flex-col h-full overflow-hidden`}>


  <div className="mb-6">
    <div className="flex items-center justify-between mb-4">
      <h1 className="text-lg font-semibold text-gray-900">BitX Studio</h1>
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 text-sm text-gray-600">
          <span>{userCredits.remaining}</span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">{userCredits.plan}</span>
        </div>
        <div className="w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-medium">U</span>
        </div>
      </div>
    </div>
  </div>

{/* Action Buttons */}
<div className="flex flex-wrap gap-2 mb-4">
  <button
    onClick={() => setShowProjectsPanel(true)}
    className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
    title="Ctrl+P"
  >
    Projects ({savedProjects.length})
  </button>
  <span className="text-gray-300">•</span>
  <button
    onClick={() => setShowHistoryPanel(true)}
    className="text-gray-600 hover:text-gray-900 text-sm font-medium transition-colors"
    title="Ctrl+H"
  >
    History ({history.length})
  </button>
  {(result?.success || multiComponentResult?.success) && (
    <>
      <span className="text-gray-300">•</span>
      <button
        onClick={handleSaveApp}
        className="text-green-600 hover:text-green-700 text-sm font-medium transition-colors"
        title="Ctrl+S"
      >
        Save
      </button>
      <span className="text-gray-300">•</span>
      
      {/* Export Button with Dropdown - Wrap in relative container */}
      <div className="relative inline-block">
        {/* ✅ Export Button with Faded/Locked Style */}
{hasSubscription() ? (
  <button
    onClick={() => setShowExportMenu(!showExportMenu)}
    className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
  >
    Export
  </button>
) : (
  <div className="relative group">
    <button
      className="text-gray-400 cursor-not-allowed text-sm font-medium opacity-50"
      disabled
    >
      🔒 Export (Pro)
    </button>
    
    {/* Tooltip */}
    <div className="absolute bottom-full left-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
      Subscribe to unlock 
      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
    </div>
  </div>
)}



        {/* Export Menu */}
        {showExportMenu && (
          <div className="absolute top-full left-0 mt-2 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <button
              onClick={() => {
                const code =
                  result?.code.frontend ||
                  multiComponentResult?.components[0]?.code ||
                  '';
                copyToClipboard(code);
                setShowExportMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm first:rounded-t-lg"
            >
              Copy Code
            </button>
            <button
              onClick={() => {
                const code =
                  result?.code.frontend ||
                  multiComponentResult?.components[0]?.code ||
                  '';
                downloadCode(`${currentComponentName}.jsx`, code);
                setShowExportMenu(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-t border-gray-100"
            >
              Download Component
            </button>
            {multiComponentResult?.components && (
              <button
                onClick={() => {
                  const allCode = multiComponentResult.components
                    .map((c) => `// ${c.name}\n${c.code}`)
                    .join('\n\n');
                  downloadCode(`${currentComponentName}-full-app.jsx`, allCode);
                  setShowExportMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-t border-gray-100 last:rounded-b-lg"
              >
                Download Full App
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )}
</div>


        <div className="flex-1 flex flex-col min-h-0">

  {/* AI Chat Interface */}
  {/* Chat interface removed - messages moved to input area */}


  {/* Enhanced Input Area with Integrated Messages */}
<div className="bg-white">

  
  {/* Messages at top of input area */}
  <div className="p-3 pb-0">
    {/* Welcome message when empty */}
    {!prompt && !result && !multiComponentResult && !isGenerating && (
      <div className="text-gray-400 text-sm mb-3">
        <p className="mb-1">💬 <strong>Chat with AI to build your app</strong></p>
        <p className="text-xs">Type what you want to build... e.g., "I need a simple online store"</p>
      </div>
    )}

   

    {/* Error State - Inline */}
    {error && (
      <div className="mb-3 p-2 bg-red-50 rounded text-sm text-red-600">
        <span className="font-medium">❌ Error:</span> {error}
        <button
          onClick={() => setError(null)}
          className="ml-2 text-blue-500 hover:text-blue-700 underline"
        >
          Try Again
        </button>
      </div>
    )}
    {/* ✅ NEW: Code Error Detection and Fix UI - Matching your existing design */}
{codeErrorState.hasErrors && (
  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0 mt-0.5">
        <svg className="h-4 w-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-medium text-amber-800">
          Code Issues Detected
        </h4>
        <div className="mt-1 text-sm text-amber-700">
          <p>
            Found {codeErrorState.validation?.summary?.criticalErrors || 0} critical errors in{' '}
            {codeErrorState.problematicComponents.length} component(s).
            {codeErrorState.canAutoFix ? ' These can be fixed automatically.' : ' Regeneration may be needed.'}
          </p>
          {codeErrorState.problematicComponents.length > 0 && (
            <p className="mt-1 text-xs">
              <strong>Affected:</strong> {codeErrorState.problematicComponents.join(', ')}
            </p>
          )}
        </div>
        <div className="mt-3 flex items-center space-x-3">
          <button
            onClick={handleFixCodeErrors}
            disabled={codeErrorState.isFixing}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white px-3 py-1.5 rounded text-sm font-medium disabled:cursor-not-allowed flex items-center space-x-1.5 transition-colors"
          >
            {codeErrorState.isFixing ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Fixing...</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
                <span>Fix Issues (Free)</span>
              </>
            )}
          </button>
          
          <button
            onClick={() => setCodeErrorState({
              hasErrors: false,
              validation: null,
              canAutoFix: false,
              problematicComponents: [],
              originalPrompt: '',
              isFixing: false
            })}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
)}
  </div>
</div>
 <div className="flex-1 min-h-0 overflow-hidden">
  <ConversationalPrompt 
    onGenerateApp={handleChatGeneration} // ✅ Direct app build
    isGenerating={isGenerating}
    error={error}
  />
</div>

  {/* Template Suggestions */}
  {showPromptTemplates && (
    <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-20">
      <div className="p-3 border-b border-gray-100 bg-gray-50">
        <h4 className="font-medium text-gray-800">💡 Popular App Ideas</h4>
        <p className="text-xs text-gray-600">Click any example to get started</p>
      </div>
      {promptTemplates.map((template, index) => (
        <button
          key={index}
          onClick={() => useTemplate(template.prompt)}
          className="w-full text-left p-3 hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors"
        >
          <div className="font-medium text-sm text-gray-800">{template.name}</div>
          <div className="text-xs text-gray-500 mt-1 line-clamp-2">{template.prompt}</div>
        </button>
      ))}
    </div>
  )}

          {/* NEW: Prompt Analysis Display */}
          {isAnalyzingPrompt && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
                <span className="text-sm text-yellow-800">Analyzing prompt complexity...</span>
              </div>
            </div>
          )}

          
          {/* NEW: Generation Mode Selector */}
          {/* Mode selection removed - will auto-detect */}

          {/* NEW: Advanced Options Panel */}
          {showAdvancedOptions && generationMode === 'multi' && (
            <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="font-semibold mb-3">Advanced App Options</h4>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={appOptions.includeRouting}
                    onChange={(e) => setAppOptions(prev => ({ ...prev, includeRouting: e.target.checked }))}
                    className="mr-2"
                  />
                  Include React Router navigation
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={appOptions.includeState}
                    onChange={(e) => setAppOptions(prev => ({ ...prev, includeState: e.target.checked }))}
                    className="mr-2"
                  />
                  Add global state management
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={appOptions.includeAPI}
                    onChange={(e) => setAppOptions(prev => ({ ...prev, includeAPI: e.target.checked }))}
                    className="mr-2"
                  />
                  Include API integration
                </label>
              </div>
            </div>
          )}

          {/* Removed duplicate generate button - using Build My App button in input area instead */}


          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">⚠️ {error}</p>
            </div>
          )}
          {/* Single Component Success Info */}
          {result && result.success && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg max-h-[200px] overflow-y-auto">
              <div className="flex gap-2 mb-2">
                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                  {result.analysis.components.length} Components
                </span>
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                  {result.analysis.complexity}
                </span>
              </div>

              <h4 className="font-semibold text-blue-800 mb-1 text-sm">Dependencies:</h4>
              <div className="flex flex-wrap gap-1">
                {result.analysis.dependencies.map((dep, index) => (
                  <span key={index} className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* NEW: Multi-Component Results */}
          {multiComponentResult && multiComponentResult.success && (
            <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200 max-h-[300px] overflow-y-auto">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-purple-800">🚀 Generated App: {multiComponentResult.appType}</h4>
                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                  {multiComponentResult.components?.length} Components
                </span>
              </div>
              
              <div className="grid grid-cols-1 gap-4 mb-3">
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">📦 Components:</h5>
                  <div className="space-y-1">
                    {multiComponentResult.components?.map((comp, index) => (
                      <div key={index} className="text-sm bg-white p-2 rounded border">
                        <span className="font-medium">{comp.name}</span>
                        <div className="text-xs text-gray-500">
                          Dependencies: {comp.dependencies?.join(', ') || 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">🛠️ Features:</h5>
                  <div className="space-y-1 text-sm">
                    {multiComponentResult.structure?.hasRouting && (
                      <div className="bg-blue-100 text-blue-700 p-2 rounded">🧭 Multi-page routing</div>
                    )}
                    {multiComponentResult.structure?.hasStateManagement && (
                      <div className="bg-green-100 text-green-700 p-2 rounded">🔄 State management</div>
                    )}
                    {multiComponentResult.structure?.hasApiIntegration && (
                      <div className="bg-orange-100 text-orange-700 p-2 rounded">🌐 API integration</div>
                    )}
                  </div>
                </div>
              </div>

              {multiComponentResult.routes && multiComponentResult.routes.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">🗺️ Routes:</h5>
                  <div className="grid grid-cols-1 gap-2">
                    {multiComponentResult.routes.map((route, index) => (
                      <div key={index} className="text-sm bg-white p-2 rounded border">
                        <code className="font-mono text-blue-600">{route.path}</code>
                        <div className="text-gray-600">{route.title}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


          {/* Keyboard Shortcuts Help */}
          <div className="mt-4 text-xs text-gray-500">
            <p><kbd className="bg-gray-100 px-1 rounded">Ctrl+Enter</kbd> Generate • <kbd className="bg-gray-100 px-1 rounded">Ctrl+S</kbd> Save • <kbd className="bg-gray-100 px-1 rounded">Ctrl+H</kbd> History • <kbd className="bg-gray-100 px-1 rounded">Esc</kbd> Close</p>
          </div>
        </div>
      </div>

  {/* Right Panel - Preview */}
<div className={`${isFullScreen ? 'w-full' : 'w-3/4'} flex flex-col bg-white h-full overflow-hidden`}>
  {/* Preview Header with Controls */}
  <div className="px-6 py-3 border-b border-gray-100 bg-white">
    <div className="flex justify-between items-center">
      {/* Status Text */}
      {(isGeneratingPreview || error || result || multiComponentResult) && (
        <div className="text-sm text-gray-600">
          {isGeneratingPreview
            ? 'Building...'
            : error
            ? `Error: ${error}`
            : (result || multiComponentResult)
            ? `${currentComponentName}`
            : null}
        </div>
      )}

      <div className="flex items-center gap-4 ml-auto">
        {/* Copy Success Notification */}
        {showCopySuccess && (
          <div className="bg-green-500 text-white px-2 py-1 rounded text-xs">
            Copied
          </div>
        )}

        {/* Preview/Code/Files Toggle Buttons */}
        <div className="flex items-center bg-gray-50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
              viewMode === 'preview'
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            disabled={!result && !multiComponentResult}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
              viewMode === 'code'
                ? 'bg-white text-gray-900 shadow-sm'
                : (!result && !multiComponentResult)
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            Code
          </button>
          <button
            onClick={() => setViewMode('files')}
            disabled={!multiComponentResult?.projectFiles}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
              viewMode === 'files'
                ? 'bg-white text-gray-900 shadow-sm'
                : (!multiComponentResult?.projectFiles)
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:bg-white/50'
            }`}
          >
            Files
          </button>
        </div>

        {/* Preview Controls (only show in preview mode) */}
        {viewMode === 'preview' && (
          <div className="flex items-center gap-2">
            {/* Device View Toggles */}
            <div className="flex bg-gray-50 rounded p-1">
              <button
                onClick={() => setDeviceView('desktop')}
                className={`w-6 h-6 rounded text-xs ${deviceView === 'desktop' ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
                title="Desktop"
              >
                💻
              </button>
              <button
                onClick={() => setDeviceView('tablet')}
                className={`w-6 h-6 rounded text-xs ${deviceView === 'tablet' ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
                title="Tablet"
              >
                📱
              </button>
              <button
                onClick={() => setDeviceView('mobile')}
                className={`w-6 h-6 rounded text-xs ${deviceView === 'mobile' ? 'bg-white shadow-sm' : 'hover:bg-white/50'}`}
                title="Mobile"
              >
                📱
              </button>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => setPreviewTheme(previewTheme === 'light' ? 'dark' : 'light')}
              className="w-6 h-6 rounded bg-gray-50 hover:bg-gray-100 text-xs"
              title="Toggle theme"
            >
              {previewTheme === 'light' ? '🌙' : '☀️'}
            </button>
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="w-6 h-6 rounded bg-gray-50 hover:bg-gray-100 text-xs"
              title="Toggle fullscreen"
            >
              {isFullScreen ? '📥' : '📤'}
            </button>
            <button
              onClick={() => setPreviewUrl(previewUrl + '?refresh=' + Date.now())}
              className="w-6 h-6 rounded bg-gray-50 hover:bg-gray-100 text-xs"
              title="Refresh"
            >
              🔄
            </button>
          </div>
        )}
      </div>
    </div>
  </div>

  {/* Enhanced Preview/Code/Files Content with Error Handling */}
  <div className="flex-1 min-h-0 overflow-hidden">
    {viewMode === 'preview' ? (
      /* Enhanced Preview with Error Boundary */
      isGeneratingPreview ? (
        <div className="w-full h-full bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-4 animate-spin">⚙️</div>
            <p className="text-lg font-semibold mb-2">Creating Live Preview...</p>
            <p className="text-sm">Compiling your {generationMode === 'single' ? 'React component' : 'multi-component app'}</p>
          </div>
        </div>
      ) : error ? (
        /* Error Display in Preview */
        <div className="w-full h-full bg-red-50 border-2 border-red-200 rounded-lg flex items-center justify-center">
          <div className="text-center text-red-600 max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <p className="text-xl font-semibold mb-2">Preview Error</p>
            <p className="text-sm mb-4">{error}</p>
            <div className="space-x-2">
              <button
                onClick={() => setError(null)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Dismiss Error
              </button>
              <button
                onClick={() => setViewMode('code')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                View Code Instead
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div 
          className={`${deviceView === 'desktop' ? 'w-full h-full' : 'mx-auto'} ${previewTheme === 'dark' ? 'bg-gray-900' : 'bg-white'} rounded-lg ${deviceView !== 'desktop' ? 'border border-gray-300 shadow-lg' : ''}`}
          style={deviceView !== 'desktop' ? getDeviceDimensions() : { height: '100vh' }}
        >
{previewUrl ? (
  <iframe
  src={previewUrl}
  className="w-full h-full rounded-lg border-0"
  title="Live Preview"
  frameBorder="0"
  sandbox="allow-scripts allow-same-origin allow-modals"
  key={previewUrl}
  style={{ minHeight: '600px', height: '100%', overflow: 'auto' }}
onLoad={() => {
  console.log('Preview loaded successfully');
}}
  onError={() => setError('Preview failed to load. Check your generated code for errors.')}
/>
) : (
  <div className="w-full h-full bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
    <div className="text-center text-gray-500">
      <div className="text-4xl mb-4">🖥️</div>
      <p className="text-lg font-semibold mb-2">No Preview Available</p>
      <p className="text-sm">Generate an app to see the live preview</p>
    </div>
  </div>
)}

        </div>
      )
    ) : viewMode === 'code' ? (
      /* Enhanced Code View with All Features */
      <div className="w-full h-full overflow-auto">
        {!result && !multiComponentResult ? (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400 max-w-md">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-xl font-medium mb-2">No Code to Display</p>
              <p className="text-sm">Generate an app first, then click the Code tab to view the source code</p>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              {/* Enhanced Code Header with Search */}
              <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <h3 className="text-white font-semibold text-lg">{currentComponentName || 'Generated Component'}</h3>
                    <div className="text-gray-400 text-sm">
                      Type: {generationMode === 'single' ? 'Single Component' : 'Multi-Component App'} | 
                      Components: (multiComponentResult?.components?.length) ?? 1
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Search Bar */}
                    <input
                      type="text"
                      placeholder="Search code..."
                      value={codeSearchTerm}
                      onChange={(e) => setCodeSearchTerm(e.target.value)}
                      className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 w-32"
                    />
                    
                    {/* Theme Selector */}
                    <select
                      value={codeTheme}
                      onChange={(e) => setCodeTheme(e.target.value as any)}
                      className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                    >
                      <option value="vs2015">VS Dark</option>
                      <option value="atomOneDark">Atom Dark</option>
                      <option value="github">GitHub Light</option>
                      <option value="solarizedLight">Solarized Light</option>
                    </select>
                    
                    {/* Enhanced Copy Button */}
                   {/* ✅ Copy All Button with Faded/Locked Style */}
{/* ✅ Copy All Button with Faded/Locked Style - FIXED */}
{hasSubscription() ? (
  <button
    onClick={() => {
      const code = result?.code?.frontend || multiComponentResult?.components?.[0]?.code;
      if (code) {
        copyCodeWithFeedback(code, 'Main Component');
      } else {
        alert('No code available to copy');
      }
    }}
    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded transition-colors"
  >
    Copy All
  </button>
) : (
  <div className="relative group">
    <button
      className="px-3 py-1 bg-gray-300 text-gray-500 text-xs rounded cursor-not-allowed opacity-50"
      disabled
    >
      🔒 Copy All (Pro)
    </button>
    
    {/* Tooltip */}
    <div className="absolute bottom-full right-0 mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
      Subscribe to unlock Copy features
      <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
    </div>
  </div>
)}

                  </div>
                </div>

                {/* Multi-Component Navigation Tabs */}
                {multiComponentResult?.components && multiComponentResult.components.length > 1 && (
                  <div className="flex space-x-1 overflow-x-auto">
                    {multiComponentResult.components.map((comp, index) => (
                      <button
                        key={index}
                        onClick={() => setActiveCodeTab(index)}
                        className={`px-3 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                          activeCodeTab === index
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {comp.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Enhanced Code Display */}
                            {/* Enhanced Code Display */}
              <div className="overflow-auto max-h-[70vh]">
                {result ? (
                  /* Single Component */
                  <SyntaxHighlighter
                    language="jsx"
                    style={
                      codeTheme === 'vs2015' ? vs2015 :
                      codeTheme === 'github' ? github :
                      codeTheme === 'atomOneDark' ? atomOneDark :
                      solarizedLight
                    }
                    customStyle={{
                      margin: 0,
                      padding: '16px',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}
                    showLineNumbers={true}
                    wrapLines={true}
                  >
                    {/* ✅ FIX: Ensure it's always a string */}
                    {String(result?.code?.frontend || '// No code available')}
                  </SyntaxHighlighter>
                ) : multiComponentResult?.components && (
                  /* Multi-Component with Tabs */
                  <div>
                    <div className="flex justify-between items-center p-3 bg-gray-800 border-b border-gray-700">
                      <div className="text-white font-medium">
                        {multiComponentResult.components[activeCodeTab]?.name}
                      </div>
                      <button
                        onClick={() => {
                          const comp = multiComponentResult.components[activeCodeTab];
                          copyCodeWithFeedback(comp.code, comp.name);
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                      >
                        📋 Copy
                      </button>
                    </div>
                    
                    <SyntaxHighlighter
                      language="jsx"
                      style={
                        codeTheme === 'vs2015' ? vs2015 :
                        codeTheme === 'github' ? github :
                        codeTheme === 'atomOneDark' ? atomOneDark :
                        solarizedLight
                      }
                      customStyle={{
                        margin: 0,
                        padding: '16px',
                        fontSize: '14px',
                        lineHeight: '1.5'
                      }}
                      showLineNumbers={true}
                      wrapLines={true}
                    >
                      {/* ✅ FIX: Ensure it's always a string */}
                      {String(multiComponentResult.components[activeCodeTab]?.code || '// No code available')}
                    </SyntaxHighlighter>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    ) : viewMode === 'files' ? (
      /* ✅ NEW: Files View */
      <div className="w-full h-full overflow-auto">
        {!multiComponentResult?.projectFiles ? (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400 max-w-md">
              <div className="text-6xl mb-4">📁</div>
              <p className="text-xl font-medium mb-2">No Project Files</p>
              <p className="text-sm">Generate a multi-component app to see project files here</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">📁 Project Files</h3>
              <div className="text-sm text-gray-500">
                {Object.keys(multiComponentResult.projectFiles).length} files
              </div>
            </div>
            
            {/* ✅ ADD: Scrollable container with fixed height */}
<div className="max-h-96 overflow-y-auto">
  <div className="grid gap-4">
    {Object.entries(multiComponentResult.projectFiles).map(([filename, content]) => (
      <div key={filename} className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-sm font-medium text-gray-900">
              {filename}
            </span>
            <span className="text-xs text-gray-500">
              ({Math.round(new Blob([content as string]).size / 1024)} KB)
            </span>
          </div>
          <button
            onClick={() => copyCodeWithFeedback(content as string, filename)}
            className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            📋 Copy
          </button>
        </div>
        
        <div className="bg-gray-50 rounded p-3 max-h-48 overflow-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap">
            {filename.endsWith('.json') ? 
              JSON.stringify(JSON.parse(content as string), null, 2) : 
              (content as string).length > 500 ? 
                (content as string).substring(0, 500) + '...' : 
                content
            }
          </pre>
        </div>
      </div>
    ))}
  </div>
</div>

            <div className="border-t pt-4">
              <button
                onClick={() => downloadProject(multiComponentResult)}
                className="mx-auto inline-block px-3 py-1.5 bg-green-500 text-white text-sm font-semibold rounded shadow hover:bg-green-600 transition-colors"
              >
                <span>📦</span>
                <span>Download Project</span>
              </button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Downloads a ZIP file with all project files and components
              </p>
            </div>
          </div>
        )}
      </div>
    ) : null}
  </div>
</div>



      {/* All existing modals remain unchanged */}
      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Save Project</h3>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:border-blue-500 focus:outline-none"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && projectName.trim() && saveProject()}
            />
            <div className="flex gap-3">
              <button
                onClick={saveProject}
                disabled={!projectName.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white py-2 px-4 rounded-lg font-medium"
              >
                Save Project
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects Panel */}
      {showProjectsPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-4/5 h-4/5 max-w-6xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">My Projects</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (savedProjects.length >= 2) {
                      setComparisonProjects([savedProjects[0], savedProjects[1]]);
                      setShowComparisonModal(true);
                    }
                  }}
                  disabled={savedProjects.length < 2}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm disabled:opacity-50"
                >
                  🔍 Compare
                </button>
                <button
                  onClick={() => setShowProjectsPanel(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto h-full">
              {savedProjects.length === 0 ? (
                <div className="col-span-full flex items-center justify-center h-64 text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-2">No saved projects yet</p>
                    <p className="text-sm">Generate an app and save it to get started!</p>
                  </div>
                </div>
              ) : (
                savedProjects.map((project) => (
                  <div key={project.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium truncate">{project.name}</h4>
                      <button
                        onClick={() => deleteProject(project.id)}
                        className="text-red-400 hover:text-red-600 text-sm ml-2"
                      >
                        🗑️
                      </button>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {project.prompt}
                    </p>
                    
                    <div className="flex justify-between items-center text-xs text-gray-500 mb-3">
                      <span>{project.componentName}</span>
                     <span>{new Date(project?.createdAt ?? Date.now()).toLocaleDateString()}</span>
                    </div>
                    
                    {/* NEW: Show if it's multi-component */}
                    // ✅ FIXED CODE with optional chaining:
{(project.components || project.project_files) && (

                      <div className="mb-2">
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                          🚀 Multi-Component
                        </span>
                      </div>
                    )}
                    
                    <button
                      onClick={() => loadProject(project)}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded text-sm font-medium"
                    >
                      Load Project
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}
      {showHistoryPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-4/5 h-4/5 max-w-4xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Generation History</h3>
              <button
                onClick={() => setShowHistoryPanel(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-3 overflow-y-auto h-full">
              {history.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-2">No generation history yet</p>
                    <p className="text-sm">Your generated apps will appear here!</p>
                  </div>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="text-sm text-gray-600 mb-2">{item.prompt}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>{item.componentName || 'Unknown Component'}</span>
                          <span>•</span>
                          <span>{new Date(item.timestamp).toLocaleString()}</span>
                          <span>•</span>
                          <span className={`px-2 py-1 rounded ${item.result?.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.result?.success ? 'Success' : 'Failed'}
                          </span>
                          {/* NEW: Show if multi-component */}
                          {item.result?.metadata.template?.includes('multi') && (
                            <>
                              <span>•</span>
                              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Multi-Component</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => loadFromHistory(item)}
                        className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm font-medium ml-4"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {showComparisonModal && comparisonProjects[0] && comparisonProjects[1] && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-11/12 h-5/6 max-w-7xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Project Comparison</h3>
              <button
                onClick={() => setShowComparisonModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-6 h-full">
              {comparisonProjects.map((project, index) => (
                <div key={index} className="border rounded-lg p-4 overflow-y-auto">
                  <h4 className="font-semibold mb-2">{project?.name}</h4>
                  <p className="text-sm text-gray-600 mb-3">{project?.prompt}</p>
                  <div className="text-xs text-gray-500 mb-3">
                    <p>Component: {project?.componentName}</p>
                    <p>Created: {project?.createdAt ? new Date(project.createdAt).toLocaleString() : 'Unknown'}</p>
                  </div>
                  <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
                    {project?.code?.code?.frontend}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 w-96 max-w-90vw">
            <h3 className="text-2xl font-bold mb-4 text-center">Welcome to BitX v2.0! 🚀</h3>
            <div className="space-y-3 text-sm text-gray-600 mb-6">
              <p>• <strong>Generate:</strong> Choose single component or complete app (Ctrl+Enter)</p>
              <p>• <strong>AI Analysis:</strong> Get smart suggestions for your prompts</p>
              <p>• <strong>Multi-Component:</strong> Generate complete apps with routing & state</p>
              <p>• <strong>Save:</strong> Save your creations to My Projects (Ctrl+S)</p>
              <p>• <strong>History:</strong> Access all your generations (Ctrl+H)</p>
              <p>• <strong>Templates:</strong> Use pre-built prompts to get started</p>
              <p>• <strong>Preview:</strong> Switch between desktop/tablet/mobile views</p>
              <p>• <strong>Export:</strong> Copy or download your generated code</p>
            </div>
            <button
              onClick={() => setShowOnboarding(false)}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-3 px-6 rounded-lg font-medium"
            >
              Get Started with BitX v2.0!
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
