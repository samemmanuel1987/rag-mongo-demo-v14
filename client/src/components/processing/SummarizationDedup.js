import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Paper,
  Typography,
  Grid,
  Chip,
  Card,
  CardContent,
  Divider,
  Alert,
  LinearProgress,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  Search as SearchIcon,
  ContentCopy as ContentCopyIcon,
  CheckCircle as CheckCircleIcon,
  Summarize as SummarizeIcon,
  FilterList as DeduplicateIcon,
  Token as TokenIcon
} from '@mui/icons-material';

// Renders a tab label with an inline count chip instead of an absolutely
// positioned Badge, which was overlapping the icon/text above it in the Tab.
function TabLabel({ text, count, color }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <span>{text}</span>
      {count > 0 && (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 20,
            height: 20,
            px: 0.6,
            borderRadius: '9999px',
            fontSize: '0.7rem',
            fontWeight: 700,
            lineHeight: 1,
            color: '#fff',
            bgcolor: color === 'secondary' ? 'secondary.main' : 'primary.main',
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ paddingTop: 16 }}>
      {value === index && children}
    </div>
  );
}

function SummarizationDedup() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [dedupResults, setDedupResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dedupLoading, setDedupLoading] = useState(false);
  const [summarizeLoading, setSummarizeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [copiedItems, setCopiedItems] = useState(new Set());
  
  // Options
  const [searchType, setSearchType] = useState('vector');
  const [limit, setLimit] = useState(20);
  const [dedupThreshold, setDedupThreshold] = useState(0.85);
  const [summaryType, setSummaryType] = useState('concise');
  const [showDuplicates, setShowDuplicates] = useState(true);

  // Search
  const handleSearch = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setSearchResults(null);
    setDedupResults(null);
    setSummary(null);

    try {
      const endpoint = searchType === 'vector' 
        ? 'http://localhost:3001/api/search'
        : searchType === 'bm25'
        ? 'http://localhost:3001/api/search/bm25'
        : 'http://localhost:3001/api/search/hybrid';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSearchResults(data);
      setTabValue(0);
    } catch (err) {
      setError(err.message);
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Deduplicate
  const handleDeduplicate = async () => {
    if (!searchResults?.results) {
      setError('No search results to deduplicate');
      return;
    }

    setDedupLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/search/deduplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: searchResults.results,
          threshold: dedupThreshold
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setDedupResults(data);
      setTabValue(1);
    } catch (err) {
      setError(err.message);
      console.error('Deduplication error:', err);
    } finally {
      setDedupLoading(false);
    }
  };

  // Summarize
  const handleSummarize = async () => {
    const resultsToSummarize = dedupResults?.deduplicated || searchResults?.results;
    
    if (!resultsToSummarize) {
      setError('No results to summarize');
      return;
    }

    setSummarizeLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3001/api/search/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: resultsToSummarize,
          summaryType,
          maxTokens: 400
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSummary(data);
      setTabValue(2);
    } catch (err) {
      setError(err.message);
      console.error('Summarization error:', err);
    } finally {
      setSummarizeLoading(false);
    }
  };

  // Safe field getters across diverse schema conventions
  const getItemId = (item, fallback = '') =>
    item?.id || item?.testCaseId || item?.userStoryId || item?.storyId || item?.key || item?.tcId || (item?._id ? String(item._id) : fallback);

  const getItemTitle = (item, fallback = 'Untitled') =>
    item?.title || item?.testCaseTitle || item?.userStoryTitle || item?.name || item?.story_title || item?.storyTitle || item?.summary || fallback;

  const getItemDescription = (item, fallback = '') =>
    item?.description || item?.testCaseDescription || item?.userStoryDescription || item?.storyDescription || item?.acceptanceCriteria || fallback;

  // Copy single item
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedItems(prev => new Set([...prev, id]));
    setTimeout(() => {
      setCopiedItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }, 2000);
  };

  // Copy multiple selected items
  const handleCopyMultiple = (results) => {
    if (!results || results.length === 0) return;
    const text = results.map((r, idx) => 
      `${idx + 1}. ${getItemId(r, `Item-${idx + 1}`)}\nTitle: ${getItemTitle(r)}\nDescription: ${getItemDescription(r)}\nModule: ${r.module || 'N/A'}\nPriority: ${r.priority || 'N/A'}\n`
    ).join('\n---\n\n');
    
    navigator.clipboard.writeText(text);
    alert('Copied ' + results.length + ' items to clipboard!');
  };

  // Format score color
  const getScoreColor = (score) => {
    if (score >= 0.8) return 'success';
    if (score >= 0.6) return 'warning';
    return 'error';
  };

  // Get score value based on search type
  const getScore = (result) => {
    // Try different score fields based on search type
    if (result.hybridScore !== undefined) return result.hybridScore;
    if (result.score !== undefined) return result.score;
    if (result.vectorScore !== undefined) return result.vectorScore;
    if (result.bm25Score !== undefined) return result.bm25Score;
    if (result.vectorScoreNormalized !== undefined) return result.vectorScoreNormalized;
    if (result.bm25ScoreNormalized !== undefined) return result.bm25ScoreNormalized;
    return null;
  };

  // Example queries
  const exampleQueries = [
    "patient login authentication",
    "merge UHID records",
    "appointment booking",
    "password reset OTP"
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
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
            <SummarizeIcon sx={{ fontSize: '1.15rem' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Summarize & Deduplicate
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Search, remove duplicate test cases, and generate AI summaries.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Search Section */}
      <Paper elevation={0} sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <TextField
              fullWidth
              label="Search Query"
              placeholder="e.g., patient login authentication"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              variant="outlined"
              sx={{ 
                '& .MuiOutlinedInput-root': { 
                  width: '100%'
                } 
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                select
                label="Search Type"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                size="small"
                sx={{ minWidth: 120 }}
                SelectProps={{ native: true }}
              >
                <option value="vector">Vector</option>
                <option value="bm25">BM25</option>
                <option value="hybrid">Hybrid</option>
              </TextField>
              <TextField
                type="number"
                label="Limit"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                size="small"
                sx={{ width: 80 }}
                inputProps={{ min: 5, max: 50 }}
              />
            </Box>
          </Grid>

          {/* Example Queries */}
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Quick Examples:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
              {exampleQueries.map((example, index) => (
                <Chip
                  key={index}
                  label={example}
                  size="small"
                  onClick={() => setQuery(example)}
                  variant="outlined"
                />
              ))}
            </Box>
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                startIcon={<SearchIcon />}
              >
                {loading ? 'Searching...' : 'Search'}
              </Button>
              
              {searchResults && (
                <>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleDeduplicate}
                    disabled={dedupLoading}
                    startIcon={<DeduplicateIcon />}
                  >
                    {dedupLoading ? 'Deduplicating...' : 'Deduplicate'}
                  </Button>
                  
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleSummarize}
                    disabled={summarizeLoading}
                    startIcon={<SummarizeIcon />}
                  >
                    {summarizeLoading ? 'Summarizing...' : 'Summarize with AI'}
                  </Button>

                  <Button
                    variant="outlined"
                    onClick={() => handleCopyMultiple(dedupResults?.deduplicated || searchResults?.results)}
                    startIcon={<ContentCopyIcon />}
                  >
                    Copy All Results
                  </Button>
                </>
              )}
            </Box>
          </Grid>

          {/* Options */}
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField
                type="number"
                label="Dedup Threshold"
                value={dedupThreshold}
                onChange={(e) => {
                  const val = e.target.value === '' ? '' : Number(e.target.value);
                  setDedupThreshold(val);
                }}
                size="small"
                sx={{ width: 190 }}
                inputProps={{ min: 0.1, max: 100, step: (Number(dedupThreshold) <= 1 ? 0.05 : 5) }}
                helperText={
                  Number(dedupThreshold) > 1
                    ? `${dedupThreshold}% (${(Number(dedupThreshold) / 100).toFixed(2)})`
                    : `${(Number(dedupThreshold) * 100).toFixed(0)}% (${dedupThreshold})`
                }
              />
              <TextField
                select
                label="Summary Type"
                value={summaryType}
                onChange={(e) => setSummaryType(e.target.value)}
                size="small"
                sx={{ width: 150 }}
                SelectProps={{ native: true }}
              >
                <option value="concise">Concise</option>
                <option value="detailed">Detailed</option>
              </TextField>
              {dedupResults && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={showDuplicates}
                      onChange={(e) => setShowDuplicates(e.target.checked)}
                    />
                  }
                  label="Show Duplicates"
                />
              )}
            </Box>
          </Grid>
        </Grid>

        {(loading || dedupLoading || summarizeLoading) && <LinearProgress sx={{ mt: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Results Section */}
      {searchResults && (
        <Paper elevation={2} sx={{ mb: 3 }}>
          <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
            <Tab 
              icon={<SearchIcon />} 
              label={
                <TabLabel text="Search Results" count={searchResults?.results?.length || 0} color="primary" />
              }
            />
            <Tab 
              icon={<DeduplicateIcon />} 
              label={
                <TabLabel text="Deduplicated" count={dedupResults?.deduplicatedCount || 0} color="secondary" />
              }
              disabled={!dedupResults}
            />
            <Tab 
              icon={<SummarizeIcon />} 
              label="AI Summary"
              disabled={!summary}
            />
          </Tabs>
          <Divider />

          {/* Tab 0: Original Search Results */}
          <TabPanel value={tabValue} index={0}>
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Original Results ({searchResults.results?.length || 0})
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopyIcon />}
                  onClick={() => handleCopyMultiple(searchResults.results)}
                >
                  Copy All
                </Button>
              </Box>
              <Grid container spacing={2}>
                {searchResults.results?.map((result, idx) => (
                  <Grid item xs={12} key={idx}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                              <Typography variant="h6" color="primary">
                                {getItemId(result, `Result ${idx + 1}`)}
                              </Typography>
                              <Chip 
                                label={`Score: ${getScore(result)?.toFixed(4) || 'N/A'}`} 
                                size="small"
                                color={getScoreColor(getScore(result) || 0)}
                              />
                            </Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                              {getItemTitle(result)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              {getItemDescription(result)}
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <Chip label={result.module || 'General'} size="small" />
                              {result.priority && <Chip label={`${result.priority} Priority`} size="small" />}
                              {result.type && <Chip label={result.type} size="small" variant="outlined" />}
                            </Box>
                          </Box>
                          <Tooltip title={copiedItems.has(getItemId(result, String(idx))) ? 'Copied!' : 'Copy'}>
                            <IconButton 
                              size="small"
                              onClick={() => handleCopy(`${getItemId(result)}: ${getItemTitle(result)}\n${getItemDescription(result)}`, getItemId(result, String(idx)))}
                              color={copiedItems.has(getItemId(result, String(idx))) ? 'success' : 'default'}
                            >
                              {copiedItems.has(getItemId(result, String(idx))) ? <CheckCircleIcon /> : <ContentCopyIcon />}
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </TabPanel>

          {/* Tab 1: Deduplicated Results */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ p: 3 }}>
              {dedupResults && (
                <>
                  {/* Stats */}
                  <Card sx={{ mb: 3, bgcolor: '#e8f5e9' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Deduplication Statistics
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Original Count
                          </Typography>
                          <Typography variant="h5">
                            {dedupResults.stats.originalCount}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            After Deduplication
                          </Typography>
                          <Typography variant="h5" color="success.main">
                            {dedupResults.stats.deduplicatedCount}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Duplicates Removed
                          </Typography>
                          <Typography variant="h5" color="error.main">
                            {dedupResults.stats.duplicatesRemoved}
                          </Typography>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <Typography variant="caption" color="text.secondary">
                            Reduction
                          </Typography>
                          <Typography variant="h5">
                            {dedupResults.stats.reductionPercentage}%
                          </Typography>
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>

                  {/* Deduplicated Results */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      Unique Results ({dedupResults.deduplicated.length})
                    </Typography>
                    <Button
                      size="small"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => handleCopyMultiple(dedupResults.deduplicated)}
                    >
                      Copy All Unique
                    </Button>
                  </Box>
                  <Grid container spacing={2}>
                    {dedupResults.deduplicated.map((result, idx) => (
                      <Grid item xs={12} key={idx}>
                        <Card variant="outlined">
                          <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Box sx={{ flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                  <Typography variant="h6" color="primary">
                                    {getItemId(result, `Item ${idx + 1}`)}
                                  </Typography>
                                  <Chip label="✓ Unique" size="small" color="success" />
                                  <Chip 
                                    label={`Score: ${getScore(result)?.toFixed(4) || 'N/A'}`} 
                                    size="small"
                                    color={getScoreColor(getScore(result) || 0)}
                                  />
                                </Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                                  {getItemTitle(result)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                  {getItemDescription(result)}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                  <Chip label={result.module || 'General'} size="small" />
                                  {result.priority && <Chip label={`${result.priority} Priority`} size="small" />}
                                  {result.type && <Chip label={result.type} size="small" variant="outlined" />}
                                </Box>
                              </Box>
                              <Tooltip title={copiedItems.has(getItemId(result, String(idx))) ? 'Copied!' : 'Copy'}>
                                <IconButton 
                                  size="small"
                                  onClick={() => handleCopy(`${getItemId(result)}: ${getItemTitle(result)}\n${getItemDescription(result)}`, getItemId(result, String(idx)))}
                                  color={copiedItems.has(getItemId(result, String(idx))) ? 'success' : 'default'}
                                >
                                  {copiedItems.has(getItemId(result, String(idx))) ? <CheckCircleIcon /> : <ContentCopyIcon />}
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Duplicates */}
                  {showDuplicates && dedupResults.duplicates.length > 0 && (
                    <Box sx={{ mt: 3 }}>
                      <Typography variant="h6" sx={{ mb: 2 }}>
                        Removed Duplicates ({dedupResults.duplicates.length})
                      </Typography>
                      <Grid container spacing={2}>
                        {dedupResults.duplicates.map((result, idx) => (
                          <Grid item xs={12} key={idx}>
                            <Card variant="outlined" sx={{ bgcolor: '#ffebee' }}>
                              <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                                  <Typography variant="h6" color="error">
                                    {getItemId(result, `Duplicate ${idx + 1}`)}
                                  </Typography>
                                  <Chip 
                                    label={`Duplicate of ${result.duplicateOf}${result.duplicateOfTitle ? `: ${result.duplicateOfTitle}` : ''}`} 
                                    size="small" 
                                    color="error" 
                                  />
                                  <Chip 
                                    label={`${(parseFloat(result.similarity || 0) * (parseFloat(result.similarity || 0) <= 1 ? 100 : 1)).toFixed(1)}% similar`} 
                                    size="small" 
                                    variant="outlined"
                                  />
                                </Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                  {getItemTitle(result)}
                                </Typography>
                                {getItemDescription(result) && (
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    {getItemDescription(result)}
                                  </Typography>
                                )}
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </TabPanel>

          {/* Tab 2: AI Summary */}
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ p: 3 }}>
              {summary && (
                <>
                  {/* Summary Card */}
                  <Card sx={{ mb: 3, bgcolor: '#e3f2fd' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SummarizeIcon color="primary" />
                            AI-Generated Summary
                          </Typography>
                          {summary.model && (
                            <Chip
                              size="small"
                              color="info"
                              label={`Model: ${summary.provider ? summary.provider.toUpperCase() + ' - ' : ''}${summary.model}`}
                            />
                          )}
                          {summary.fallbackUsed && (
                            <Chip size="small" color="warning" label="Fallback Activated" />
                          )}
                        </Box>
                        <Tooltip title="Copy summary">
                          <IconButton 
                            size="small"
                            onClick={() => handleCopy(summary.summary, 'summary')}
                            color={copiedItems.has('summary') ? 'success' : 'default'}
                          >
                            {copiedItems.has('summary') ? <CheckCircleIcon /> : <ContentCopyIcon />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                        {summary.summary}
                      </Typography>
                    </CardContent>
                  </Card>

                  {/* Token & Cost Info */}
                  <Card sx={{ bgcolor: '#fff3e0' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TokenIcon /> Token Usage & Cost
                      </Typography>
                      <Grid container spacing={3}>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="caption" color="text.secondary">
                            Model
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                            {summary.model || 'Unknown'}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="caption" color="text.secondary">
                            Prompt Tokens
                          </Typography>
                          <Typography variant="h6">
                            {summary.tokens?.prompt?.toLocaleString() || '0'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ${summary.cost?.input || '0.000000'}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="caption" color="text.secondary">
                            Completion Tokens
                          </Typography>
                          <Typography variant="h6">
                            {summary.tokens?.completion?.toLocaleString() || '0'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ${summary.cost?.output || '0.000000'}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                          <Typography variant="caption" color="text.secondary">
                            Total Cost
                          </Typography>
                          <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
                            ${summary.cost?.total || '0.000000'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {summary.tokens?.total?.toLocaleString() || '0'} tokens
                          </Typography>
                        </Grid>
                      </Grid>
                      
                      <Divider sx={{ my: 2 }} />
                      
                      <Typography variant="caption" color="text.secondary">
                        Model: {summary.model || 'Configured LLM (Groq / Gemini / OpenAI / Claude / Mistral)'}
                      </Typography>
                    </CardContent>
                  </Card>
                </>
              )}
            </Box>
          </TabPanel>
        </Paper>
      )}
    </Box>
  );
}

export default SummarizationDedup;
