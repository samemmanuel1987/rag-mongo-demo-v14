import React, { useState, useCallback } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Alert,
  Collapse,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ArticleIcon from '@mui/icons-material/Article';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import InfoIcon from '@mui/icons-material/Info';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import { useSnackbar } from 'notistack';

const API_BASE = 'http://localhost:3001/api';

function RerankingSearch() {
  const [query, setQuery] = useState('Share Diagnostic Reports with Patients via WhatsApp');
  const [limit, setLimit] = useState(10);
  const [rerankTopK, setRerankTopK] = useState(50);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [beforeResults, setBeforeResults] = useState([]);
  const [afterResults, setAfterResults] = useState([]);
  const [searchInfo, setSearchInfo] = useState(null);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState({ modules: [], priorities: [], risks: [], types: [] });
  const [moduleFilter, setModuleFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [automationFilter, setAutomationFilter] = useState('');
  const [tabValue, setTabValue] = useState(0);
  const { enqueueSnackbar } = useSnackbar();
  
  // Safe field getters across diverse schema conventions
  const getItemId = (item, fallback = '') =>
    item?.id || item?.testCaseId || item?.userStoryId || item?.storyId || item?.key || item?.tcId || (item?._id ? String(item._id) : fallback);

  const getItemTitle = (item, fallback = 'Untitled') =>
    item?.title || item?.testCaseTitle || item?.userStoryTitle || item?.name || item?.story_title || item?.storyTitle || item?.summary || fallback;

  const getItemDescription = (item, fallback = '') =>
    item?.description || item?.testCaseDescription || item?.userStoryDescription || item?.storyDescription || item?.acceptanceCriteria || fallback;

  const loadFilterOptions = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/metadata/distinct`);
      const data = await response.json();
      
      if (data.success && data.metadata) {
        setFilterOptions(data.metadata);
      } else if (data.success && data.data) {
        setFilterOptions(data.data);
      } else {
        setFilterOptions({ modules: [], priorities: [], risks: [], types: [] });
      }
    } catch (err) {
      console.error('Failed to load filter options:', err);
      setFilterOptions({ modules: [], priorities: [], risks: [], types: [] });
    }
  }, []);

  React.useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  const handleSearch = async () => {
    if (!query.trim()) {
      enqueueSnackbar('Please enter a search query', { variant: 'warning' });
      return;
    }

    setSearching(true);
    setError(null);
    setResults([]);
    setBeforeResults([]);
    setAfterResults([]);
    setSearchInfo(null);

    try {
      const filters = {};
      if (moduleFilter) filters.module = moduleFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (riskFilter) filters.risk = riskFilter;
      if (automationFilter) filters.automationManual = automationFilter;

      // Use Groq-only reranking (skip score fusion)
      const response = await fetch(`${API_BASE}/search/rerank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit,
          rerankTopK,
          useGroqOnly: true,  // Use Groq LLM for reranking
          filters
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      if (data.success) {
        const finalResults = data.afterResults || data.results || [];
        const initialBefore = data.beforeResults || data.candidates || (data.results ? [...data.results].sort((a, b) => (a.originalRank || 0) - (b.originalRank || 0)) : []);
        setResults(finalResults);
        setBeforeResults(initialBefore);
        setAfterResults(finalResults);
        setSearchInfo({
          count: data.count,
          totalCandidates: data.candidatesEvaluated || initialBefore.length || finalResults.length,
          searchTime: data.timing?.searchTime || 0,
          rerankingTime: data.timing?.rerankTime || data.timing?.groqTime || 0,
          totalTime: data.timing?.totalTime || 0,
          query: data.query,
          filters: data.filters,
          reranked: true,
          rerankModel: data.rerankModel,
          rerankProvider: data.rerankProvider,
          fallbackUsed: data.fallbackUsed,
          mode: 'semantic-rerank'
        });
        enqueueSnackbar(`Found ${data.count} results ranked by AI Reranker (${data.rerankModel || 'Semantic LLM'})`, { variant: 'success' });
      }
    } catch (err) {
      setError(err.message);
      enqueueSnackbar(err.message, { variant: 'error' });
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !searching) {
      handleSearch();
    }
  };

  const formatScore = (score) => {
    return score ? score.toFixed(4) : '0.0000';
  };

  const getScoreColor = (score) => {
    // Use normalized score thresholds (0-1 range)
    if (score >= 0.8) return 'success';
    if (score >= 0.6) return 'info';
    if (score >= 0.4) return 'warning';
    return 'error';
  };

  const getRankChangeIcon = (rankChange) => {
    if (rankChange > 0) return <TrendingUpIcon fontSize="small" color="success" />;
    if (rankChange < 0) return <TrendingDownIcon fontSize="small" color="error" />;
    return <SwapVertIcon fontSize="small" color="disabled" />;
  };

  const getRankChangeColor = (rankChange) => {
    if (rankChange > 0) return 'success';
    if (rankChange < 0) return 'error';
    return 'default';
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: 'auto', padding: 3 }}>
      <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '9999px',
              bgcolor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'success.main',
            }}
          >
            <MergeTypeIcon sx={{ fontSize: '1.15rem' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Groq AI Reranking
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Combines BM25 + Vector search, then uses Groq AI for intelligent semantic reranking.
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Search Query"
              variant="outlined"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., merge UHID, patient registration, login tests..."
              disabled={searching}
               sx={{ 
                '& .MuiOutlinedInput-root': { 
                  width: '100%'
                } 
              }}
            />
          </Grid>

          <Grid item xs={6} md={2}>
            <TextField
              fullWidth
              label="Top-K Candidates"
              type="number"
              variant="outlined"
              value={rerankTopK}
              onChange={(e) => setRerankTopK(Math.max(10, Math.min(100, parseInt(e.target.value) || 50)))}
              disabled={searching}
              inputProps={{ min: 10, max: 100 }}
            />
          </Grid>

          <Grid item xs={6} md={1}>
            <TextField
              fullWidth
              label="Final Limit"
              type="number"
              variant="outlined"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
              disabled={searching}
              inputProps={{ min: 1, max: 50 }}
            />
          </Grid>

          <Grid item xs={6} md={1}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              size="large"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              startIcon={searching ? <CircularProgress size={20} /> : <SearchIcon />}
              sx={{ height: '56px' }}
            >
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </Grid>
        </Grid>

        {/* Filters */}
        <Box sx={{ mt: 2 }}>
          <Button
            startIcon={<FilterListIcon />}
            endIcon={showFilters ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowFilters(!showFilters)}
            size="small"
          >
            Filters
          </Button>

          <Collapse in={showFilters}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={moduleFilter}
                    onChange={(e) => setModuleFilter(e.target.value)}
                    label="Module"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Modules</MenuItem>
                    {filterOptions.modules.map((module) => (
                      <MenuItem key={module} value={module}>{module}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    label="Priority"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Priorities</MenuItem>
                    {filterOptions.priorities.map((priority) => (
                      <MenuItem key={priority} value={priority}>{priority}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Risk</InputLabel>
                  <Select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    label="Risk"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Risk Levels</MenuItem>
                    {filterOptions.risks.map((risk) => (
                      <MenuItem key={risk} value={risk}>{risk}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={automationFilter}
                    onChange={(e) => setAutomationFilter(e.target.value)}
                    label="Type"
                    sx={{ bgcolor: 'background.paper' , minWidth: '200px',width: '100%'}}
                  >
                    <MenuItem value="">All Types</MenuItem>
                    {filterOptions.types.map((type) => (
                      <MenuItem key={type} value={type}>{type}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Collapse>
        </Box>
      </Paper>

      {/* Search Info */}
      {searchInfo && (
        <Alert 
          severity="success"
          icon={<MergeTypeIcon />}
          sx={{ mb: 3 }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2" fontWeight={700}>
                AI Semantic Reranking Results:
              </Typography>
              <Typography variant="body2">
                Found {searchInfo.count} test cases evaluated from {searchInfo.totalCandidates || searchInfo.count} candidates
              </Typography>
              {searchInfo.rerankModel && (
                <Chip
                  size="small"
                  color="primary"
                  label={`Model: ${searchInfo.rerankProvider ? searchInfo.rerankProvider.toUpperCase() + ' - ' : ''}${searchInfo.rerankModel}`}
                />
              )}
              {searchInfo.fallbackUsed && (
                <Chip size="small" color="warning" label="Fallback Activated" />
              )}
            </Box>
            <Typography variant="caption" color="text.secondary">
              <strong>Timing:</strong> Total: {searchInfo.totalTime}ms | <strong>LLM Reranking Time:</strong> {searchInfo.rerankingTime}ms | <strong>Method:</strong> Hybrid Retrieval → Semantic LLM Scoring
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Results with Before/After Tabs */}
      {results.length > 0 && (
        <Box>
          <Paper elevation={2} sx={{ mb: 3 }}>
            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
              <Tab label="After Reranking (Final)" />
              <Tab label="Before Reranking (Original)" />
              <Tab label="Comparison Table" />
            </Tabs>
          </Paper>

          {/* Tab 0: After Reranking */}
          {tabValue === 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <ArticleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                After Groq AI Reranking ({afterResults.length} results)
              </Typography>              {afterResults.map((result, index) => (
                <Card key={result._id || index} sx={{ mb: 2 }} elevation={2}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`#${result.newRank || index + 1}`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                          />
                          <Typography variant="h6" component="div">
                            {getItemId(result, `Result ${index + 1}`)}
                          </Typography>
                          <Chip 
                            label={`Rerank Score: ${formatScore(result.rerankScore || result.fusedScore)}`} 
                            color="success"
                            size="small"
                          />
                          {result.originalRank && (
                            <Chip 
                              label={`Was #${result.originalRank}`} 
                              size="small" 
                              variant="outlined"
                            />
                          )}
                        </Box>

                        <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                          {getItemTitle(result)}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          {result.module && (
                            <Chip label={`Module: ${result.module}`} size="small" variant="outlined" />
                          )}
                          {result.priority && (
                            <Chip 
                              label={result.priority} 
                              size="small" 
                              color={result.priority === 'P1' ? 'error' : result.priority === 'P2' ? 'warning' : 'default'}
                            />
                          )}
                          {result.risk && (
                            <Chip 
                              label={`Risk: ${result.risk}`} 
                              size="small" 
                              color={result.risk === 'High' ? 'error' : result.risk === 'Medium' ? 'warning' : 'success'}
                              variant="outlined"
                            />
                          )}
                        </Box>

                        {getItemDescription(result) && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            <strong>Description:</strong> {getItemDescription(result)}
                          </Typography>
                        )}

                        <Divider sx={{ my: 1 }} />

                        {/* Score Breakdown */}
                        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'grey.50' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                            <strong>Ranking Scores:</strong>
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            {result.vectorScore !== undefined && (
                              <Typography variant="caption" color="text.secondary">
                                🧠 Vector Score: {formatScore(result.vectorScore)}
                              </Typography>
                            )}
                            {result.bm25Score !== undefined && (
                              <Typography variant="caption" color="text.secondary">
                                🔤 BM25 Score: {formatScore(result.bm25Score)}
                              </Typography>
                            )}
                            <Typography variant="caption" color="text.secondary">
                              ⭐ AI Rerank: {formatScore(result.rerankScore || 0.5)}
                            </Typography>
                          </Box>
                        </Paper>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* Tab 1: Before Reranking */}
          {tabValue === 1 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <ArticleIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Initial Candidate Ranking (Before AI Reranking - {beforeResults.length} results from 50 candidates)
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  These are the initial candidates before AI semantic reranking. Notice how AI reorders them based on actual relevance to your query!
                </Typography>
              </Alert>

              {beforeResults.map((result, index) => (
                <Card key={result._id || index} sx={{ mb: 2 }} elevation={2}>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`Candidate Rank: #${result.originalRank || index + 1}`} 
                            size="small" 
                            color="default" 
                            variant="outlined"
                          />
                          <Typography variant="h6" component="div">
                            {getItemId(result, `Candidate ${index + 1}`)}
                          </Typography>
                          <Chip 
                            label={`Vector: ${formatScore(result.vectorScore || 0)}`} 
                            color={getScoreColor(result.vectorScore || 0)}
                            size="small"
                          />
                          {result.rerankScore !== undefined && (
                            <Chip 
                              label={`Rerank Score: ${formatScore(result.rerankScore)}`} 
                              size="small" 
                              color="success"
                              sx={{ fontWeight: 'bold' }}
                            />
                          )}
                        </Box>

                        <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                          {getItemTitle(result)}
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                          {result.module && (
                            <Chip label={`Module: ${result.module}`} size="small" variant="outlined" />
                          )}
                          {result.priority && (
                            <Chip 
                              label={result.priority} 
                              size="small" 
                              color={result.priority === 'P1' ? 'error' : result.priority === 'P2' ? 'warning' : 'default'}
                            />
                          )}
                        </Box>

                        {getItemDescription(result) && (
                          <Typography variant="body2" color="text.secondary">
                            <strong>Description:</strong> {getItemDescription(result)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}

          {/* Tab 2: Comparison Table */}
          {tabValue === 2 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <CompareArrowsIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                Before vs After Comparison
              </Typography>

              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Original Rank (Candidates)</strong></TableCell>
                      <TableCell><strong>Test Case ID</strong></TableCell>
                      <TableCell><strong>Title</strong></TableCell>
                      <TableCell><strong>Vector Score</strong></TableCell>
                      <TableCell><strong>Groq Rerank Score</strong></TableCell>
                      <TableCell><strong>Final Rank</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {afterResults.map((result, newRankIndex) => {
                      const newRank = newRankIndex + 1;
                      const originalRank = result.originalRank || (newRankIndex + 1);
                      const rankChange = typeof originalRank === 'number' ? originalRank - newRank : 0;
                      
                      return (
                        <TableRow 
                          key={result._id || newRankIndex}
                          sx={{ 
                            backgroundColor: newRankIndex < 3 ? 'action.hover' : 'inherit'
                          }}
                        >
                          <TableCell>#{originalRank}</TableCell>
                          <TableCell>{getItemId(result, `TC-${newRankIndex + 1}`)}</TableCell>
                          <TableCell sx={{ maxWidth: 300 }}>
                            {getItemTitle(result).substring(0, 50)}{getItemTitle(result).length > 50 ? '...' : ''}
                          </TableCell>
                          <TableCell>{formatScore(result.vectorScore || result.score || 0)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={formatScore(result.rerankScore || 0.5)} 
                              size="small" 
                              color="success"
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <strong>#{newRank}</strong>
                              {rankChange !== 0 && (
                                <Chip
                                  size="small"
                                  icon={getRankChangeIcon(rankChange)}
                                  label={`${rankChange > 0 ? '+' : ''}${rankChange}`}
                                  color={getRankChangeColor(rankChange)}
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Alert severity="info" icon={<InfoIcon />} sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>How to read this table:</strong><br />
                  • <strong>Original Rank:</strong> Position in the 50-candidate pool<br />
                  • <strong>Vector Score:</strong> Semantic similarity (0.0-1.0)<br />
                  • <strong>Groq Rerank Score:</strong> AI-based relevance score<br />
                  • <strong>Final Rank:</strong> Top-10 position after reranking<br />
                  • 🟦 Highlighted rows = Top-3 results by Groq AI<br />
                  • Compare Original Rank vs Final Rank to see how much Groq reordered each result
                </Typography>
              </Alert>
            </Box>
          )}
        </Box>
      )}

      {/* No Results Message */}
      {!searching && results.length === 0 && searchInfo && (
        <Alert severity="info">
          No test cases found matching your search query. Try adjusting your search terms or filters.
        </Alert>
      )}
    </Box>
  );
}

export default RerankingSearch;
