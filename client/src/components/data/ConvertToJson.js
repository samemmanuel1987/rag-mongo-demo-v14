import React, { useState } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Alert,
  CircularProgress,
  TextField,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Grid,
  Step,
  Stepper,
  StepLabel,
  Fade,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Avatar
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Description as DescriptionIcon,
  InsertDriveFile as FileIcon,
  Transform as TransformIcon,
  Refresh as RefreshIcon,
  FiberManualRecord as DotIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const steps = ['Select File', 'Configure', 'Convert'];

// Data type configurations
const dataTypeConfig = {
  testcases: {
    label: 'Test Cases',
    defaultSheet: 'testcases',
    columns: [
      'Module',
      'Test ID',
      'Pre-Requisites',
      'Test Title',
      'Test Case Description',
      'Test Steps',
      'Expected Results',
      'Automation/Manual',
      'Priority',
      'Created By',
      'Created Date',
      'Last modified date',
      'Risk',
      'Version',
      'Type'
    ]
  },
  userstories: {
    label: 'User Stories',
    defaultSheet: 'stories',
    columns: [
      'Story ID / Key',
      'Summary / Title',
      'Description',
      'Status',
      'Priority',
      'Assignee',
      'Reporter',
      'Story Points',
      'Components',
      'Labels',
      'Sprint',
      'Epic',
      'Acceptance Criteria',
      'Created Date',
      'Updated Date'
    ]
  }
};

function ConvertToJson() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [dataType, setDataType] = useState('testcases');
  const [sheetName, setSheetName] = useState(dataTypeConfig.testcases.defaultSheet);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const { enqueueSnackbar } = useSnackbar();

  const handleDataTypeChange = (event) => {
    const newType = event.target.value;
    setDataType(newType);
    setSheetName(dataTypeConfig[newType].defaultSheet);
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        enqueueSnackbar('Please select a valid Excel file (.xlsx or .xls)', { variant: 'error' });
        return;
      }
      setSelectedFile(file);
      setResult(null);
      setError(null);
      setActiveStep(1);
      enqueueSnackbar('File selected successfully', { variant: 'success' });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      enqueueSnackbar('Please select a file first', { variant: 'error' });
      return;
    }

    if (!sheetName.trim()) {
      enqueueSnackbar('Please enter a sheet name', { variant: 'error' });
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sheetName', sheetName);
    formData.append('dataType', dataType);

    setUploading(true);
    setError(null);
    setResult(null);
    setActiveStep(2);

    try {
      const response = await axios.post(`${API_BASE}/upload-excel`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      setActiveStep(3);
      enqueueSnackbar(`${dataTypeConfig[dataType].label} converted successfully!`, { variant: 'success' });
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Upload failed';
      setError(errorMessage);
      setActiveStep(1);
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setDataType('testcases');
    setSheetName(dataTypeConfig.testcases.defaultSheet);
    setResult(null);
    setError(null);
    setActiveStep(0);
    enqueueSnackbar('Form reset', { variant: 'info' });
  };

  const currentConfig = dataTypeConfig[dataType];

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Page Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '9999px',
              bgcolor: 'rgba(79, 70, 229, 0.08)',
              border: '1px solid rgba(79, 70, 229, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'primary.main',
            }}
          >
            <TransformIcon sx={{ fontSize: '1.15rem' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              Convert Excel to JSON
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Upload Excel files (Test Cases or User Stories) and convert them to structured JSON.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Progress Stepper */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stepper activeStep={activeStep} alternativeLabel>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        {uploading && <LinearProgress sx={{ mt: 2 }} />}
      </Paper>

      <Grid container spacing={3}>
        {/* Upload Section */}
        <Grid item xs={12} md={8}>
          <Card elevation={0}>
            <CardHeader
              title="File Upload"
              subheader="Select data type and configure your Excel file"
              avatar={
                <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                  <CloudUploadIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
              }
              titleTypographyProps={{ fontWeight: 700, fontSize: '1rem' }}
            />
            <CardContent>
              {/* Data Type Selector */}
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="data-type-label">Data Type</InputLabel>
                <Select
                  labelId="data-type-label"
                  id="data-type-select"
                  value={dataType}
                  label="Data Type"
                  onChange={handleDataTypeChange}
                >
                  <MenuItem value="testcases">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="TC" size="small" color="primary" sx={{ minWidth: 40 }} />
                      Test Cases
                    </Box>
                  </MenuItem>
                  <MenuItem value="userstories">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label="US" size="small" color="secondary" sx={{ minWidth: 40 }} />
                      User Stories
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ mb: 3 }}>
                <input
                  accept=".xlsx,.xls"
                  style={{ display: 'none' }}
                  id="excel-file-upload"
                  type="file"
                  onChange={handleFileSelect}
                />
                <label htmlFor="excel-file-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<CloudUploadIcon />}
                    size="large"
                    fullWidth
                    sx={{
                      py: 3,
                      borderStyle: 'dashed',
                      borderWidth: '2px',
                      borderColor: 'primary.main',
                      bgcolor: 'rgba(99, 102, 241, 0.04)',
                      '&:hover': {
                        borderStyle: 'dashed',
                        borderWidth: '2px',
                        bgcolor: 'rgba(99, 102, 241, 0.08)',
                      }
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body1" fontWeight={600}>
                        Select Excel File ({currentConfig.label})
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Accepts .xlsx and .xls files
                      </Typography>
                    </Box>
                  </Button>
                </label>
              </Box>

              {selectedFile && (
                <Fade in={true}>
                  <Card
                    variant="outlined"
                    sx={{
                      mb: 3,
                      bgcolor: 'rgba(99, 102, 241, 0.04)',
                      borderColor: 'primary.light',
                    }}
                  >
                    <CardContent sx={{ py: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
                          <FileIcon sx={{ fontSize: '1rem' }} />
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {selectedFile.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </Typography>
                        </Box>
                        <Chip label="Selected" color="primary" size="small" />
                      </Box>
                    </CardContent>
                  </Card>
                </Fade>
              )}

              <TextField
                label="Sheet Name"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                variant="outlined"
                fullWidth
                sx={{ mb: 3 }}
                helperText={`Name of the Excel sheet to convert (default: ${currentConfig.defaultSheet})`}
                error={!sheetName.trim()}
              />

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading || !sheetName.trim()}
                  startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <TransformIcon />}
                  size="large"
                  sx={{ flexGrow: 1 }}
                >
                  {uploading ? 'Converting...' : `Convert ${currentConfig.label}`}
                </Button>

                <Button
                  variant="outlined"
                  onClick={resetForm}
                  disabled={uploading}
                  startIcon={<RefreshIcon />}
                  size="large"
                >
                  Reset
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Info Panel */}
        <Grid item xs={12} md={4}>
          <Card
            elevation={0}
            sx={{
              height: 'fit-content',
              background: dataType === 'testcases'
                ? 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)'
                : 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(249,115,22,0.08) 100%)',
              border: '1px solid',
              borderColor: dataType === 'testcases' ? 'rgba(99,102,241,0.2)' : 'rgba(245,158,11,0.2)',
            }}
          >
            <CardHeader
              title={`Expected ${currentConfig.label} Columns`}
              titleTypographyProps={{ fontWeight: 700, fontSize: '0.9375rem' }}
              avatar={
                <Avatar
                  sx={{
                    bgcolor: dataType === 'testcases' ? 'primary.main' : 'secondary.main',
                    width: 32,
                    height: 32
                  }}
                >
                  <DescriptionIcon sx={{ fontSize: '1rem' }} />
                </Avatar>
              }
            />
            <CardContent sx={{ pt: 0 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Your Excel file should contain these columns:
              </Typography>
              <List dense disablePadding>
                {currentConfig.columns.map((column) => (
                  <ListItem key={column} sx={{ py: 0.25, px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 24 }}>
                      <DotIcon sx={{ fontSize: '0.5rem', color: 'primary.main' }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={column}
                      primaryTypographyProps={{
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Results Section */}
      {(result || error) && (
        <Fade in={true}>
          <Card elevation={0} sx={{ mt: 3 }}>
            <CardHeader
              title="Conversion Results"
              avatar={
                result
                  ? <Avatar sx={{ bgcolor: 'success.main', width: 32, height: 32 }}><CheckCircleIcon sx={{ fontSize: '1rem' }} /></Avatar>
                  : <Avatar sx={{ bgcolor: 'error.main', width: 32, height: 32 }}><ErrorIcon sx={{ fontSize: '1rem' }} /></Avatar>
              }
              titleTypographyProps={{ fontWeight: 700 }}
            />
            <CardContent>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <strong>Error:</strong> {error}
                </Alert>
              )}

              {result && (
                <Box>
                  <Alert severity="success" sx={{ mb: 3 }}>
                    <strong>Success!</strong> {result.message}
                  </Alert>

                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Output File
                          </Typography>
                          <Typography variant="body1" color="primary" fontWeight={600}>
                            {result.outputFile}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Saved to data folder
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            Status
                          </Typography>
                          <Chip label="Completed" color="success" />
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Ready for embedding creation
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>

                  {result.output && (
                    <Card variant="outlined" sx={{ mt: 2 }}>
                      <CardContent>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Conversion Log
                        </Typography>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 2,
                            bgcolor: 'background.default',
                            maxHeight: 200,
                            overflow: 'auto',
                            borderRadius: '10px',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography
                            variant="body2"
                            component="pre"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              fontFamily: '"JetBrains Mono", monospace',
                              fontSize: '0.75rem',
                              m: 0,
                            }}
                          >
                            {result.output}
                          </Typography>
                        </Paper>
                      </CardContent>
                    </Card>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Fade>
      )}
    </Box>
  );
}

export default ConvertToJson;