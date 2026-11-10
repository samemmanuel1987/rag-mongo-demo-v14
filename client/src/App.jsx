import React, { useState, useEffect } from 'react';
import {
  CssBaseline,
  ThemeProvider,
  createTheme,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Divider,
  Container,
  IconButton,
  Tooltip,
  Breadcrumbs,
  Link,
  useMediaQuery,
  Fade,
  Avatar,
  alpha
} from '@mui/material';
import {
  Transform as TransformIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
  Search as SearchIcon,
  Menu as MenuIcon,
  ChevronLeft as ChevronLeftIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  NavigateNext as NavigateNextIcon,
  TextFields as KeywordIcon,
  AutoFixHigh as HybridIcon,
  CompareArrows as RerankIcon,
  Psychology as PreprocessIcon,
  Summarize as SummarizeIcon,
  Schema as SchemaIcon,
  AutoAwesome as AutoAwesomeIcon
} from '@mui/icons-material';
import { SnackbarProvider } from 'notistack';

// Import components
import ConvertToJson from './components/data/ConvertToJson';
import EmbeddingsStore from './components/data/EmbeddingsStore';
import QuerySearch from './components/search/QuerySearch';
import BM25Search from './components/search/BM25Search';
import HybridSearch from './components/search/HybridSearch';
import RerankingSearch from './components/search/RerankingSearch';
import QueryPreprocessing from './components/processing/QueryPreprocessing';
import SummarizationDedup from './components/processing/SummarizationDedup';
import PromptSchemaManager from './components/processing/PromptSchemaManager';
import Settings from './components/settings/Settings';

// Ultra-modern, high-contrast & rich enterprise theme
const createEnterpriseTheme = (mode) => createTheme({
  palette: {
    mode,
    primary: {
      main: '#4F46E5',   // Electric Indigo for tabs, steppers, focus rings & accents
      light: '#6366F1',
      dark: '#3730A3',
      contrastText: '#FFFFFF'
    },
    secondary: {
      main: '#0284C7',   // Slate Cyan / Steel Blue
      light: '#38BDF8',
      dark: '#0369A1',
      contrastText: '#FFFFFF'
    },
    accent: {
      main: '#EC4899',
      light: '#F472B6',
      dark: '#DB2777'
    },
    success: {
      main: '#059669',   // Solid Emerald Teal
      light: '#10B981',
      dark: '#047857',
      contrastText: '#FFFFFF'
    },
    error: {
      main: '#E11D48',   // Solid Rose
      light: '#F43F5E',
      dark: '#BE123C',
    },
    warning: {
      main: '#D97706',   // Solid Amber
      light: '#F59E0B',
      dark: '#B45309',
    },
    info: {
      main: '#2563EB',   // Solid Royal Blue
      light: '#3B82F6',
      dark: '#1D4ED8',
    },
    background: {
      default: mode === 'light' ? '#F8FAFC' : '#0B0F19',
      paper: mode === 'light' ? '#FFFFFF' : '#131B2E'
    },
    text: {
      primary: mode === 'light' ? '#0F172A' : '#F8FAFC',
      secondary: mode === 'light' ? '#475569' : '#94A3B8'
    },
    divider: mode === 'light' ? '#E2E8F0' : '#1E293B',
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    ...Array(24).fill('none') // Completely flat enterprise shadow system
  ],
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
    h4: {
      fontWeight: 700,
      fontSize: '1.65rem',
      lineHeight: 1.25,
      letterSpacing: '-0.025em'
    },
    h5: {
      fontWeight: 700,
      fontSize: '1.2rem',
      lineHeight: 1.3,
      letterSpacing: '-0.02em'
    },
    h6: {
      fontWeight: 600,
      fontSize: '0.975rem',
      lineHeight: 1.4,
      letterSpacing: '-0.01em'
    },
    subtitle1: {
      fontWeight: 600,
      fontSize: '0.9rem',
      lineHeight: 1.5,
      letterSpacing: '-0.01em'
    },
    subtitle2: {
      fontWeight: 700,
      fontSize: '0.75rem',
      lineHeight: 1.5,
      letterSpacing: '0.04em',
      textTransform: 'uppercase'
    },
    body1: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
      letterSpacing: '-0.005em'
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.5
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
      letterSpacing: '0.01em'
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '-0.01em'
    }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
        }
      }
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: '24px', // Clean curved pill action buttons
          padding: '10px 24px',
          fontSize: '0.875rem',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          transition: 'all 180ms ease',
          position: 'relative',
          overflow: 'hidden',
          textTransform: 'none',
          boxShadow: 'none !important',
          '&:hover': {
            boxShadow: 'none !important',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            boxShadow: 'none !important',
            transform: 'translateY(0)',
          },
          '&:focus': {
            boxShadow: 'none !important',
          }
        },
        sizeSmall: {
          borderRadius: '20px',
          padding: '7px 18px',
          fontSize: '0.8125rem',
        },
        sizeLarge: {
          borderRadius: '28px',
          padding: '12px 30px',
          fontSize: '0.9375rem',
          fontWeight: 700,
        },
        containedPrimary: {
          backgroundColor: '#FF4F38', // Solid Vibrant Coral
          color: '#FFFFFF',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: '#E03E27',
            boxShadow: 'none !important',
          },
        },
        containedSecondary: {
          backgroundColor: '#1E293B', // Solid Slate
          color: '#FFFFFF',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: '#0F172A',
            boxShadow: 'none !important',
          },
        },
        containedSuccess: {
          backgroundColor: '#059669', // Solid Emerald
          color: '#FFFFFF',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: '#047857',
            boxShadow: 'none !important',
          },
        },
        containedError: {
          backgroundColor: '#E11D48', // Solid Rose
          color: '#FFFFFF',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: '#BE123C',
            boxShadow: 'none !important',
          },
        },
        containedWarning: {
          backgroundColor: '#D97706', // Solid Amber
          color: '#FFFFFF',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: '#B45309',
            boxShadow: 'none !important',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          borderRadius: '24px',
          borderColor: mode === 'light' ? '#CBD5E1' : '#334155',
          color: mode === 'light' ? '#1E293B' : '#F1F5F9',
          backgroundColor: mode === 'light' ? '#FFFFFF' : '#0F172A',
          boxShadow: 'none !important',
          '&:hover': {
            borderWidth: '1.5px',
            borderColor: '#FF4F38',
            backgroundColor: mode === 'light' ? '#FFF5F3' : '#3C1B17',
            color: mode === 'light' ? '#FF4F38' : '#FF7360',
            boxShadow: 'none !important',
          }
        },
        text: {
          borderRadius: '24px',
          boxShadow: 'none !important',
          '&:hover': {
            backgroundColor: mode === 'light' ? 'rgba(255, 79, 56, 0.08)' : 'rgba(255, 115, 96, 0.14)',
            boxShadow: 'none !important',
          }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: 'none !important',
          transition: 'all 180ms ease',
          '&:hover': {
            backgroundColor: mode === 'light' ? 'rgba(255, 79, 56, 0.08)' : 'rgba(255, 115, 96, 0.14)',
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: '14px',
          border: mode === 'light' ? '1px solid #E2E8F0' : '1px solid #1E293B',
          boxShadow: 'none', // Clean flat cards
          transition: 'border-color 200ms ease',
          '&:hover': {
            boxShadow: 'none',
            borderColor: mode === 'light' ? '#CBD5E1' : '#334155',
          }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: '14px',
          backgroundImage: 'none',
          boxShadow: 'none',
        }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '12px', // Proper rounded rectangle input shape!
            transition: 'border-color 180ms ease',
            backgroundColor: mode === 'light' ? '#FFFFFF' : '#0F172A',
            boxShadow: 'none',
            '& fieldset': {
              borderWidth: '1.5px',
              borderColor: mode === 'light' ? '#CBD5E1' : '#334155',
            },
            '&:hover fieldset': {
              borderColor: '#FF4F38',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#FF4F38',
              borderWidth: '2px',
            },
            '&.Mui-focused': {
              boxShadow: 'none',
            }
          },
          '& .MuiOutlinedInput-input': {
            padding: '12px 16px', // Spacious, comfortable field padding
          },
          '& .MuiOutlinedInput-multiline': {
            padding: '12px 16px',
            borderRadius: '14px',
          }
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          boxShadow: 'none',
          '& fieldset': {
            borderWidth: '1.5px',
            borderColor: mode === 'light' ? '#CBD5E1' : '#334155',
          },
          '&:hover fieldset': {
            borderColor: '#FF4F38',
          },
          '&.Mui-focused fieldset': {
            borderColor: '#FF4F38',
            borderWidth: '2px',
          },
          '&.Mui-focused': {
            boxShadow: 'none',
          }
        },
        input: {
          padding: '12px 16px',
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: '9999px', // Pill chips & badges
          fontSize: '0.75rem',
          padding: '4px 8px',
          boxShadow: 'none !important',
          transition: 'all 150ms ease',
        },
        filled: {
          '&.MuiChip-colorPrimary': {
            backgroundColor: mode === 'light' ? '#EEF2FF' : '#1E1B4B',
            color: mode === 'light' ? '#3730A3' : '#C7D2FE',
            border: `1px solid ${mode === 'light' ? '#C7D2FE' : '#312E81'}`,
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: mode === 'light' ? '#F0F9FF' : '#0C4A6E',
            color: mode === 'light' ? '#0369A1' : '#BAE6FD',
            border: `1px solid ${mode === 'light' ? '#BAE6FD' : '#075985'}`,
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: mode === 'light' ? '#ECFDF5' : '#064E3B',
            color: mode === 'light' ? '#047857' : '#A7F3D0',
            border: `1px solid ${mode === 'light' ? '#A7F3D0' : '#065F46'}`,
          },
          '&.MuiChip-colorError': {
            backgroundColor: mode === 'light' ? '#FEF2F2' : '#7F1D1D',
            color: mode === 'light' ? '#B91C1C' : '#FECDD3',
            border: `1px solid ${mode === 'light' ? '#FECDD3' : '#991B1B'}`,
          },
          '&.MuiChip-colorWarning': {
            backgroundColor: mode === 'light' ? '#FFFBEB' : '#78350F',
            color: mode === 'light' ? '#B45309' : '#FDE68A',
            border: `1px solid ${mode === 'light' ? '#FDE68A' : '#92400E'}`,
          },
        },
        outlined: {
          borderColor: mode === 'light' ? '#CBD5E1' : '#334155',
          backgroundColor: mode === 'light' ? '#F8FAFC' : '#0F172A',
        }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: '16px',
          fontWeight: 500,
          fontSize: '0.875rem',
          backdropFilter: 'blur(12px)',
          '& .MuiAlert-icon': {
            fontSize: '1.35rem',
          }
        },
        standardSuccess: {
          backgroundColor: mode === 'light' ? '#F0FDF4' : alpha('#10B981', 0.14),
          color: mode === 'light' ? '#15803D' : '#34D399',
          border: `1px solid ${mode === 'light' ? '#BBF7D0' : alpha('#10B981', 0.28)}`,
        },
        standardError: {
          backgroundColor: mode === 'light' ? '#FFF1F2' : alpha('#F43F5E', 0.14),
          color: mode === 'light' ? '#BE123C' : '#FB7185',
          border: `1px solid ${mode === 'light' ? '#FECDD3' : alpha('#F43F5E', 0.28)}`,
        },
        standardInfo: {
          backgroundColor: mode === 'light' ? '#F0F9FF' : alpha('#0EA5E9', 0.14),
          color: mode === 'light' ? '#0369A1' : '#38BDF8',
          border: `1px solid ${mode === 'light' ? '#BAE6FD' : alpha('#0EA5E9', 0.28)}`,
        },
        standardWarning: {
          backgroundColor: mode === 'light' ? '#FFFBEB' : alpha('#F59E0B', 0.14),
          color: mode === 'light' ? '#B45309' : '#FBBF24',
          border: `1px solid ${mode === 'light' ? '#FDE68A' : alpha('#F59E0B', 0.28)}`,
        },
      }
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: 'none',
        }
      }
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '14px',
          margin: '4px 10px',
          padding: '10px 16px',
          transition: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&.Mui-selected': {
            background: mode === 'light'
              ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.14) 0%, rgba(124, 58, 237, 0.12) 100%)'
              : 'linear-gradient(135deg, rgba(79, 70, 229, 0.32) 0%, rgba(124, 58, 237, 0.26) 100%)',
            color: mode === 'light' ? '#4F46E5' : '#818CF8',
            boxShadow: mode === 'light' ? '0 4px 12px rgba(79, 70, 229, 0.12)' : '0 4px 16px rgba(0,0,0,0.3)',
            '&:hover': {
              background: mode === 'light'
                ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.18) 0%, rgba(124, 58, 237, 0.15) 100%)'
                : 'linear-gradient(135deg, rgba(79, 70, 229, 0.38) 0%, rgba(124, 58, 237, 0.30) 100%)',
            },
            '& .MuiListItemIcon-root': {
              color: mode === 'light' ? '#4F46E5' : '#818CF8',
            },
            '& .MuiListItemText-primary': {
              fontWeight: 700,
              color: mode === 'light' ? '#4F46E5' : '#818CF8',
            }
          },
          '&:hover': {
            backgroundColor: mode === 'light' ? 'rgba(79, 70, 229, 0.06)' : 'rgba(79, 70, 229, 0.14)',
            transform: 'translateX(4px)',
          }
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
        }
      }
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 48,
        },
        indicator: {
          height: 4,
          borderRadius: '4px 4px 0 0',
          background: 'linear-gradient(90deg, #4F46E5, #0EA5E9, #EC4899)',
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          borderRadius: '12px',
          margin: '0 4px',
          minHeight: 44,
          transition: 'all 200ms ease',
          '&.Mui-selected': {
            fontWeight: 700,
            color: mode === 'light' ? '#4F46E5' : '#818CF8',
          }
        }
      }
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: '9999px',
          height: 8,
          backgroundColor: mode === 'light' ? '#E2E8F0' : '#1E293B',
        },
        bar: {
          borderRadius: '9999px',
          background: 'linear-gradient(90deg, #4F46E5, #0EA5E9, #EC4899)',
        }
      }
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          borderRadius: '10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          padding: '8px 14px',
          backgroundColor: mode === 'light' ? '#0F172A' : '#F8FAFC',
          color: mode === 'light' ? '#F8FAFC' : '#0F172A',
          boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        }
      }
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: '14px',
        }
      }
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          '& .MuiStepIcon-root.Mui-active': {
            color: '#4F46E5',
          },
          '& .MuiStepIcon-root.Mui-completed': {
            color: '#10B981',
          }
        }
      }
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 52,
          height: 30,
          padding: 0,
        },
        switchBase: {
          padding: 3,
          '&.Mui-checked': {
            transform: 'translateX(22px)',
            color: '#FFFFFF',
            '& + .MuiSwitch-track': {
              opacity: 1,
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
            },
          },
        },
        thumb: {
          width: 24,
          height: 24,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        },
        track: {
          borderRadius: 9999,
          opacity: 1,
          backgroundColor: mode === 'light' ? '#CBD5E1' : '#334155',
        },
      }
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: mode === 'light' ? '#E2E8F0' : '#1E293B',
        }
      }
    },
  }
});

const drawerWidth = 280;
const collapsedDrawerWidth = 72;

// Section groupings for the sidebar
const sidebarSections = [
  {
    label: 'DATA PIPELINE',
    items: [
      {
        id: 'convert',
        label: 'Convert to JSON',
        icon: <TransformIcon />,
        component: ConvertToJson,
        description: 'Upload and convert Excel files',
      },
      {
        id: 'embeddings',
        label: 'Embeddings & Store',
        icon: <StorageIcon />,
        component: EmbeddingsStore,
        description: 'Create and manage embeddings in MongoDB',
      },
    ]
  },
  {
    label: 'SEARCH ENGINES',
    items: [
      {
        id: 'preprocess',
        label: 'Query Preprocessing',
        icon: <PreprocessIcon />,
        component: QueryPreprocessing,
        description: 'Transform & expand search queries',
      },
      {
        id: 'query',
        label: 'Vector Search',
        icon: <SearchIcon />,
        component: QuerySearch,
        description: 'Semantic AI vector search',
      },
      {
        id: 'bm25',
        label: 'BM25 Search',
        icon: <KeywordIcon />,
        component: BM25Search,
        description: 'Keyword-based search algorithm',
      },
      {
        id: 'hybrid',
        label: 'Hybrid Search',
        icon: <HybridIcon />,
        component: HybridSearch,
        description: 'Combined BM25 + Vector search',
      },
      {
        id: 'rerank',
        label: 'Score Fusion',
        icon: <RerankIcon />,
        component: RerankingSearch,
        description: 'Groq AI semantic reranking',
      },
    ]
  },
  {
    label: 'AI PROCESSING',
    items: [
      {
        id: 'summarize',
        label: 'Summarize & Dedup',
        icon: <SummarizeIcon />,
        component: SummarizationDedup,
        description: 'AI summarization & deduplication',
      },
      {
        id: 'prompt-schema',
        label: 'Prompt & Schema',
        icon: <SchemaIcon />,
        component: PromptSchemaManager,
        description: 'Configure system prompt templates',
      },
    ]
  },
  {
    label: 'SYSTEM CONFIG',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        icon: <SettingsIcon />,
        component: Settings,
        description: 'Environment & API keys configuration',
      },
    ]
  },
];

// Flatten for lookup
const allMenuItems = sidebarSections.flatMap(s => s.items);

function App() {
  const [selectedMenuItem, setSelectedMenuItem] = useState('convert');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  const isMobile = useMediaQuery('(max-width:768px)');
  const theme = createEnterpriseTheme(darkMode ? 'dark' : 'light');

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (isMobile) {
      setDrawerOpen(false);
    } else {
      setDrawerOpen(true);
    }
  }, [isMobile]);

  const handleDrawerToggle = () => {
    setDrawerOpen(!drawerOpen);
  };

  const handleThemeToggle = () => {
    setDarkMode(!darkMode);
  };

  const getCurrentComponent = () => {
    const menuItem = allMenuItems.find(item => item.id === selectedMenuItem);
    const Component = menuItem?.component;
    return Component ? <Component /> : <div>Select a menu item</div>;
  };

  const getCurrentMenuItem = () => {
    return allMenuItems.find(item => item.id === selectedMenuItem);
  };

  const actualDrawerWidth = drawerOpen ? drawerWidth : collapsedDrawerWidth;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={3}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        dense
        preventDuplicate
        autoHideDuration={3000}
      >
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
          {/* ====== Top Floating Glass Header ====== */}
          <AppBar
            position="fixed"
            elevation={0}
            sx={{
              width: { sm: `calc(100% - ${actualDrawerWidth + 32}px)` },
              ml: { sm: `${actualDrawerWidth + 16}px` },
              mr: { sm: '16px' },
              mt: 1.5,
              borderRadius: '16px', // Modern rounded corners for floating header!
              transition: theme.transitions.create(['width', 'margin'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
              backgroundColor: darkMode
                ? 'rgba(15, 23, 42, 0.82)'
                : 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${darkMode ? 'rgba(51, 65, 85, 0.7)' : 'rgba(226, 232, 240, 0.9)'}`,
              color: darkMode ? '#F8FAFC' : '#0F172A',
              boxShadow: darkMode
                ? '0 10px 30px -10px rgba(0, 0, 0, 0.5)'
                : '0 10px 30px -10px rgba(0, 0, 0, 0.06)',
              zIndex: (theme) => theme.zIndex.drawer + 1,
            }}
          >
            <Toolbar sx={{ minHeight: '60px !important', px: { xs: 2, sm: 2.5 } }}>
              {/* Circular Frosted Hamburger Button */}
              <IconButton
                edge="start"
                onClick={handleDrawerToggle}
                sx={{
                  mr: 2,
                  width: 42,
                  height: 42,
                  borderRadius: '9999px', // Circular shape!
                  backgroundColor: darkMode ? 'rgba(30, 41, 59, 0.75)' : 'rgba(241, 245, 249, 0.85)',
                  border: `1px solid ${darkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(203, 213, 225, 0.8)'}`,
                  backdropFilter: 'blur(8px)',
                  color: darkMode ? '#F1F5F9' : '#1E293B',
                  transition: 'all 200ms ease',
                  '&:hover': {
                    backgroundColor: darkMode ? 'rgba(51, 65, 85, 0.9)' : 'rgba(226, 232, 240, 1)',
                    transform: 'scale(1.06)',
                  }
                }}
              >
                {drawerOpen ? <ChevronLeftIcon sx={{ fontSize: '1.25rem' }} /> : <MenuIcon sx={{ fontSize: '1.25rem' }} />}
              </IconButton>

              {/* Breadcrumbs Navigation */}
              <Breadcrumbs
                separator={<NavigateNextIcon fontSize="small" sx={{ color: 'text.secondary', opacity: 0.6 }} />}
                sx={{ flexGrow: 1 }}
              >
                <Link
                  component="button"
                  variant="body2"
                  underline="hover"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 600,
                    cursor: 'pointer',
                    '&:hover': { color: 'primary.main' }
                  }}
                  onClick={() => setSelectedMenuItem('convert')}
                >
                  RAG Pipeline
                </Link>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.primary',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75
                  }}
                >
                  {getCurrentMenuItem()?.icon &&
                    React.cloneElement(getCurrentMenuItem()?.icon, { sx: { fontSize: '1.1rem', color: 'primary.main' } })
                  }
                  {getCurrentMenuItem()?.label}
                </Typography>
              </Breadcrumbs>

              {/* Active description badge */}
              <Typography
                variant="caption"
                sx={{
                  display: { xs: 'none', md: 'block' },
                  color: 'primary.main',
                  mr: 2,
                  px: 2,
                  py: 0.75,
                  borderRadius: '9999px',
                  bgcolor: darkMode ? 'rgba(79, 70, 229, 0.14)' : 'rgba(79, 70, 229, 0.08)',
                  border: '1px solid',
                  borderColor: darkMode ? 'rgba(79, 70, 229, 0.28)' : 'rgba(79, 70, 229, 0.18)',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              >
                {getCurrentMenuItem()?.description}
              </Typography>

              {/* Circular Frosted Theme Toggle Button */}
              <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                <IconButton
                  onClick={handleThemeToggle}
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '9999px', // Full Circle!
                    color: darkMode ? '#FBBF24' : '#4F46E5',
                    backgroundColor: darkMode ? 'rgba(251, 191, 36, 0.12)' : 'rgba(79, 70, 229, 0.08)',
                    border: `1px solid ${darkMode ? 'rgba(251, 191, 36, 0.3)' : 'rgba(79, 70, 229, 0.2)'}`,
                    backdropFilter: 'blur(8px)',
                    transition: 'all 200ms ease',
                    '&:hover': {
                      backgroundColor: darkMode ? 'rgba(251, 191, 36, 0.22)' : 'rgba(79, 70, 229, 0.16)',
                      transform: 'scale(1.06)',
                    }
                  }}
                >
                  {darkMode ? <LightModeIcon sx={{ fontSize: '1.2rem' }} /> : <DarkModeIcon sx={{ fontSize: '1.2rem' }} />}
                </IconButton>
              </Tooltip>
            </Toolbar>
          </AppBar>

          {/* ====== Sidebar Drawer ====== */}
          <Drawer
            variant={isMobile ? 'temporary' : 'permanent'}
            open={isMobile ? drawerOpen : true}
            onClose={handleDrawerToggle}
            sx={{
              width: actualDrawerWidth,
              flexShrink: 0,
              '& .MuiDrawer-paper': {
                width: actualDrawerWidth,
                boxSizing: 'border-box',
                transition: theme.transitions.create('width', {
                  easing: theme.transitions.easing.sharp,
                  duration: theme.transitions.duration.enteringScreen,
                }),
                overflowX: 'hidden',
                backgroundColor: darkMode ? '#0B0F19' : '#FFFFFF',
                borderRight: `1px solid ${darkMode ? '#1E293B' : '#E2E8F0'}`,
              },
            }}
          >
            {/* Sidebar Brand Header */}
            <Box
              sx={{
                px: drawerOpen ? 2.5 : 1.5,
                py: 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: '64px',
              }}
            >
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: '9999px',
                  backgroundColor: '#FFFFFF',
                  border: `1px solid ${darkMode ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.9)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: '6px',
                  flexShrink: 0,
                  boxShadow: 'none',
                }}
              >
                <Box
                  component="img"
                  src="https://assets.testleaf.com/assets/img/favicon.png"
                  alt="TestLeaf Logo"
                  sx={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                  }}
                />
              </Box>
              {drawerOpen && (
                <Fade in={drawerOpen} timeout={300}>
                  <Box sx={{ overflow: 'hidden' }}>
                    <Typography
                      variant="h6"
                      className="gradient-text-animated"
                      sx={{
                        fontWeight: 900,
                        fontSize: '1.05rem',
                        lineHeight: 1.2,
                        letterSpacing: '-0.02em'
                      }}
                    >
                      RAG Pipeline
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 600 }}>
                      Enterprise v2.0 • Testleaf
                    </Typography>
                  </Box>
                </Fade>
              )}
            </Box>

            <Divider sx={{ mx: 2 }} />

            {/* Sidebar Navigation */}
            <Box sx={{ pt: 1, pb: 2, flex: 1, overflowY: 'auto' }}>
              {sidebarSections.map((section) => (
                <Box key={section.label} sx={{ mb: 1 }}>
                  {drawerOpen && (
                    <Typography
                      variant="caption"
                      sx={{
                        px: 3,
                        py: 1,
                        display: 'block',
                        fontWeight: 800,
                        fontSize: '0.65rem',
                        letterSpacing: '0.12em',
                        color: 'text.secondary',
                        opacity: 0.7,
                        mt: 1.5,
                      }}
                    >
                      {section.label}
                    </Typography>
                  )}
                  <List disablePadding className="stagger">
                    {section.items.map((item) => (
                      <ListItem key={item.id} disablePadding>
                        <Tooltip
                          title={drawerOpen ? '' : item.label}
                          placement="right"
                          arrow
                        >
                          <ListItemButton
                            selected={selectedMenuItem === item.id}
                            onClick={() => {
                              setSelectedMenuItem(item.id);
                              if (isMobile) setDrawerOpen(false);
                            }}
                            sx={{
                              minHeight: 44,
                              justifyContent: drawerOpen ? 'initial' : 'center',
                              px: drawerOpen ? 2 : 2.5,
                            }}
                          >
                            <ListItemIcon
                              sx={{
                                minWidth: 0,
                                mr: drawerOpen ? 2 : 'auto',
                                justifyContent: 'center',
                                color: selectedMenuItem === item.id ? 'primary.main' : 'text.secondary',
                                transition: 'color 200ms ease',
                              }}
                            >
                              {item.icon}
                            </ListItemIcon>

                            {drawerOpen && (
                              <ListItemText
                                primary={item.label}
                                primaryTypographyProps={{
                                  fontSize: '0.8125rem',
                                  fontWeight: selectedMenuItem === item.id ? 700 : 500,
                                }}
                              />
                            )}
                          </ListItemButton>
                        </Tooltip>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ))}
            </Box>

            {/* Sidebar Footer */}
            <Box sx={{ p: 2 }}>
              <Divider sx={{ mb: 2 }} />
              {drawerOpen ? (
                <Fade in={drawerOpen} timeout={300}>
                  <Box
                    sx={{
                      p: 1.75,
                      borderRadius: '12px',
                      background: darkMode
                        ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.15) 0%, rgba(14, 165, 233, 0.15) 100%)'
                        : 'linear-gradient(135deg, rgba(79, 70, 229, 0.06) 0%, rgba(14, 165, 233, 0.06) 100%)',
                      border: '1px solid',
                      borderColor: darkMode ? 'rgba(79, 70, 229, 0.25)' : 'rgba(79, 70, 229, 0.15)',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AutoAwesomeIcon sx={{ fontSize: '0.9rem', color: 'primary.main' }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', fontSize: '0.72rem' }}>
                        Enterprise AI Stack
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.675rem', display: 'block', mt: 0.5, fontWeight: 500 }}>
                      MongoDB Atlas • Mistral AI • Groq
                    </Typography>
                  </Box>
                </Fade>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <AutoAwesomeIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
                </Box>
              )}
            </Box>
          </Drawer>

          {/* ====== Main Content Area ====== */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              position: 'relative',
              bgcolor: 'background.default',
              minHeight: '100vh',
              overflow: 'hidden',
              transition: theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.leavingScreen,
              }),
            }}
          >
            {/* Ambient animated aurora backdrop */}
            <Box className="aurora-bg" aria-hidden />

            <Toolbar sx={{ minHeight: '84px !important' }} />

            <Container
              maxWidth={false}
              sx={{ py: 2.5, px: { xs: 2, sm: 3, md: 4 }, position: 'relative', zIndex: 1 }}
            >
              <Fade in={true} timeout={400} key={selectedMenuItem}>
                <Box className="animate-slide-up">
                  {getCurrentComponent()}
                </Box>
              </Fade>
            </Container>
          </Box>
        </Box>
      </SnackbarProvider>
    </ThemeProvider>
  );
}

export default App;
