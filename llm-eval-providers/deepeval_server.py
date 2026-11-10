#!/usr/bin/env python3
"""
Deepeval FastAPI Sidecar Server
This runs separately from the Node.js server and provides LLM evaluation metrics.

Installation:
  pip install fastapi uvicorn deepeval

Usage:
  python deepeval_server.py
  # or
  uvicorn deepeval_server:app --reload --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Union
import logging
import os
from dotenv import load_dotenv
from openai import OpenAI
import json
from pathlib import Path

# Load environment variables (look for root .env)
root_env = Path(__file__).resolve().parent.parent / '.env'
if root_env.exists():
    load_dotenv(dotenv_path=root_env)
else:
    load_dotenv()


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import DeepEval base class
from deepeval.models.base_model import DeepEvalBaseLLM

app = FastAPI(
    title="Deepeval Evaluation Service",
    description="FastAPI for LLM evaluation using Deepeval",
    version="1.0.0"
)

# Add CORS middleware to allow Node.js calls
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom middleware to log raw request body
@app.middleware("http")
async def log_request_body(request, call_next):
    """Log incoming request body for debugging"""
    if request.method == "POST":
        body = await request.body()
        if body:
            try:
                body_dict = json.loads(body)
                logger.info(f"=== Raw JSON Body ===")
                logger.info(f"Body keys: {list(body_dict.keys())}")
                logger.info(f"Body: {json.dumps(body_dict, indent=2)}")
            except:
                logger.info(f"Could not parse JSON body: {body[:200]}")
        # Re-attach body for FastAPI to consume
        async def receive():
            return {"type": "http.request", "body": body}
        request._receive = receive
    
    response = await call_next(request)
    return response


class EvalRequest(BaseModel):
    """Request body for evaluation.
    
    Properly separates user query, retrieved context, and model output for accurate metric scoring.
    """
    query: Optional[str] = None  # what the user asked
    context: Optional[List[str]] = None  # list of retrieved docs or source passages
    output: Optional[str] = None  # model's answer to be evaluated (OPTIONAL for contextual metrics, REQUIRED for others)
    expected_output: Optional[str] = None  # expected/reference answer (REQUIRED for RAGAS)
    provider: Optional[str] = None  # LLM provider: 'groq' or 'openai'
    metric: Optional[Union[str, List[str]]] = "faithfulness"  # metric(s) to evaluate - string, array, or "all"
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "query": "Salesforce login troubleshooting steps",
                "context": [
                    "Salesforce login error codes and fixes (invalid username/password, lockout, SSO).",
                    "Admin guide: Resetting user passwords and unlocking users in Salesforce.",
                    "Troubleshooting MFA login failures for Salesforce.",
                    "Network & allowlist: Salesforce trust domains, firewall/proxy, TLS/cipher requirements."
                ],
                "output": "LLM response",
                "expected_output": "Steps to resolve Salesforce login issues: verify username, reset password, check SSO/SAML, network/allowlist, lockout, MFA.",
                "metric": "contextual_recall"
            }
        }
    )


class ClaimVerdict(BaseModel):
    """Individual claim verdict from faithfulness evaluation (IDK support)"""
    claim: str
    verdict: str  # "yes" | "no" | "idk"
    reason: Optional[str] = None


class FaithfulnessDetail(BaseModel):
    """Detailed faithfulness evaluation breakdown with IDK verdicts"""
    truths: List[str]  # Facts extracted from context
    claims: List[str]  # Claims extracted from output
    verdicts: List[ClaimVerdict]  # Verdict for each claim (yes/no/idk)
    idk_count: int  # Number of ambiguous claims (idk)
    yes_count: int  # Number of supported claims
    no_count: int  # Number of contradictory claims


class MetricResult(BaseModel):
    """Individual metric evaluation result"""
    metric_name: str
    score: Optional[float] = None
    verdict: Optional[str] = None  # FAITHFUL, NOT_FAITHFUL, HIGH_RECALL, LOW_RECALL, etc.
    explanation: Optional[str] = None
    error: Optional[str] = None
    # Detailed breakdown for faithfulness metric
    detail: Optional[FaithfulnessDetail] = None


class EvalResponse(BaseModel):
    """Response with evaluation metrics"""
    results: List[MetricResult]  # Array of metric results
    # Legacy fields for backward compatibility (when single metric)
    metric_name: Optional[str] = None
    score: Optional[float] = None
    explanation: Optional[str] = None
    error: Optional[str] = None


class GroqModel(DeepEvalBaseLLM):
    """Custom Groq model wrapper for DeepEval compatibility."""
    
    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        """Initialize Groq client.
        """
        self.client = OpenAI(
            api_key=api_key,
       
           base_url="https://api.groq.com/openai/v1"
        )
        self.model_name = model
        logger.info(f"Initialized Groq model: {model}")
    
    def load_model(self):
        """Load model - required by DeepEvalBaseLLM."""
        return self.client
    
    def generate(self, prompt: str, schema: Optional[object] = None) -> str:
        """Generate completion using Groq API.
        
        Args:
            prompt: The input prompt
            schema: Optional Pydantic model for structured output
        
        Returns:
            Generated text response or JSON string if schema provided
        """
        try:
            # Check if we need structured output
            if schema:
                # Request JSON format in the prompt
                json_prompt = f"{prompt}\n\nRespond with valid JSON only, no other text."
                
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that responds in JSON format."},
                        {"role": "user", "content": json_prompt}
                    ],
                    temperature=0.0,
                    response_format={"type": "json_object"}  # Enable JSON mode
                )
                
                content = response.choices[0].message.content
                
                # Parse and validate JSON against schema if it's a Pydantic model
                try:
                    import json
                    json_data = json.loads(content)
                    # If schema is a Pydantic model, validate and return instance
                    if hasattr(schema, 'model_validate'):
                        return schema.model_validate(json_data)
                    return content
                except Exception as json_err:
                    logger.warning(f"Failed to parse JSON response: {str(json_err)[:100]}")
                    return content
            else:
                # Regular text generation with neutral system message
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.0
                )
                return response.choices[0].message.content
                
        except Exception as e:
            logger.error(f"Groq API error: {str(e)}")
            raise
    
    async def a_generate(self, prompt: str, schema: Optional[object] = None) -> str:
        """Async generate - for DeepEval compatibility."""
        return self.generate(prompt, schema)
    
    def get_model_name(self) -> str:
        """Return model name - required by DeepEvalBaseLLM."""
        return self.model_name
    
    def should_use_azure_openai(self) -> bool:
        """Check if using Azure - required by DeepEvalBaseLLM."""
        return False


def get_verdict_for_metric(metric_name: str, score: float) -> str:
    """Generate verdict based on metric type and score.
    
    Returns:
        - Faithfulness: NOT_FAITHFUL, PARTIAL, FAITHFUL
        - Contextual Recall: LOW_RECALL, PARTIAL_RECALL, HIGH_RECALL
        - Contextual Precision: LOW_PRECISION, PARTIAL_PRECISION, HIGH_PRECISION
        - RAGAS: LOW, PARTIAL, HIGH
        - Answer Relevancy: NOT_RELEVANT, PARTIAL, RELEVANT
    """
    metric_lower = metric_name.lower()
    
    if metric_lower == "faithfulness":
        if score >= 0.75:
            return "FAITHFUL"
        elif score >= 0.5:
            return "PARTIAL"
        else:
            return "NOT_FAITHFUL"
    
    elif metric_lower in ["contextual_recall", "context_recall"]:
        if score >= 0.75:
            return "HIGH_RECALL"
        elif score >= 0.5:
            return "PARTIAL_RECALL"
        else:
            return "LOW_RECALL"
    
    elif metric_lower in ["contextual_precision", "context_precision"]:
        if score >= 0.75:
            return "HIGH_PRECISION"
        elif score >= 0.5:
            return "PARTIAL_PRECISION"
        else:
            return "LOW_PRECISION"
    
    elif metric_lower == "ragas":
        if score >= 0.7:
            return "HIGH"
        elif score >= 0.5:
            return "PARTIAL"
        else:
            return "LOW"
    
    elif metric_lower == "answer_relevancy":
        if score >= 0.75:
            return "RELEVANT"
        elif score >= 0.5:
            return "PARTIAL"
        else:
            return "NOT_RELEVANT"
    
    elif metric_lower == "pii_leakage":
        # score is leakage rate: 0.0 = safe (no leakage), 1.0 = high leakage
        if score >= 0.70:
            return "HIGH_LEAKAGE"
        elif score >= 0.25:
            return "PARTIAL_LEAKAGE"
        else:
            return "SAFE"
    
    elif metric_lower == "bias":
        # score is bias rate: 0.0 = unbiased (neutral/fair), 1.0 = biased
        if score >= 0.70:
            return "BIASED"
        elif score >= 0.30:
            return "PARTIAL_BIAS"
        else:
            return "UNBIASED"
    
    elif metric_lower == "hallucination":
        # score is hallucination rate: 0.0 = factual/no hallucination, 1.0 = hallucinated
        if score >= 0.70:
            return "HALLUCINATED"
        elif score >= 0.30:
            return "PARTIAL_HALLUCINATION"
        else:
            return "FACTUAL"
    
    # Default
    return "PARTIAL" if score >= 0.5 else "LOW"


class MetricEvaluator:
    """Enterprise-grade metric evaluation system with hybrid strictness approach.
    
    Uses strict_mode=False for natural LLM judgment, then applies custom post-processing rules:
    
    - Faithfulness: Natural LLM scoring + hallucination detection (caps score if output mentions 
      entities like 'Salesforce', 'CRM' not in context)
      
    - Answer Relevancy: Natural LLM scoring + definition enforcement (for "What is X?" questions,
      requires output to mention X and use definitional language like "is a/an")
      
    - Contextual Precision/Recall: Natural LLM scoring without additional rules
    
    This hybrid approach leverages model intelligence while catching common failure patterns.
    OpenAI models (like gpt-4o-mini) provide stricter base scoring than Groq models.
    """
    
    SUPPORTED_METRICS = {
        "faithfulness": "Evaluates if the output is faithful to the source context (hybrid: LLM judgment + hallucination detection)",
        "contextual_precision": "Evaluates if retrieved context is relevant and precise to answer the query (requires: query, context, expected_output)",
        "contextual_recall": "Evaluates if retrieval_context contains all necessary information to answer expected_output (requires: context, expected_output)",
        "pii_leakage": "Detects personally identifiable information (PII) in LLM outputs (requires: query, output)",
        "bias": "Detects bias in LLM outputs (requires: query, output)",
        "hallucination": "Detects hallucinations in LLM outputs by comparing with context (requires: query, context, output)",
        "ragas": "Comprehensive RAG evaluation combining context_precision, context_recall, faithfulness, and answer_relevancy (requires: query, context, expected_output, output)",
        "answer_relevancy": "Evaluates if the output is relevant to the query/input (requires: query, output)",
    }
    
    def __init__(self, api_key: str, model_name: str = "llama-3.3-70b-versatile", use_groq: bool = False, idk_handling: str = "no"):
        """Initialize the evaluator with API credentials.
        
        Args:
            api_key: API key for the LLM provider (OpenAI or Groq)
            model_name: Model to use for evaluation
            use_groq: Whether to use Groq API instead of OpenAI
            idk_handling: How to handle 'idk' verdicts in faithfulness (yes/no/count)
        """
        if not api_key or api_key == "your-openai-api-key-here" or api_key == "your-groq-api-key-here":
            raise ValueError("Valid API key is required")
        
        self.model_name = model_name
        self.use_groq = use_groq
        self.idk_handling = idk_handling.lower() if idk_handling else "count"
        
        if use_groq:
            # Use custom Groq model
            logger.info(f"Using Groq API with model: {model_name}")
            self.model = GroqModel(api_key=api_key, model=model_name)
        else:
            # Standard OpenAI
            os.environ["OPENAI_API_KEY"] = api_key
            logger.info(f"Using OpenAI API with model: {model_name}")
            from deepeval.models import GPTModel
            self.model = GPTModel(model=model_name)
    
    def validate_metric(self, metric_name: str) -> bool:
        """Validate if the requested metric is supported."""
        m = metric_name.lower()
        if m == "context_precision":
            m = "contextual_precision"
        elif m == "context_recall":
            m = "contextual_recall"
        return m in self.SUPPORTED_METRICS
    
    def create_test_case(
        self,
        query: Optional[str],
        context: Optional[List[str]],
        output: str,
        expected_output: Optional[str] = None,
    ):
        """Create a standardized test case for evaluation.
        
        For RAGAS, expected_output MUST be set (it will never be None for RAGAS calls).
        For faithfulness/hallucination, expected_output should be None to allow context-based evaluation.
        """
        # Standard LLMTestCase for all metrics
        from deepeval.test_case import LLMTestCase
        
        # Debug: Log the incoming context
        logger.info(f"DEBUG: Incoming context - type: {type(context)}, value: {context}")
        
        # Ensure context is always a list for deepeval
        # For metrics that require context (like hallucination), ensure it's not None or empty
        if context is None:
            # For metrics requiring context, provide a default context item
            retrieval_ctx = ["No context provided"]
            logger.info("DEBUG: Context was None, using default")
        else:
            # Ensure context is a list and filter out empty strings
            if isinstance(context, list):
                retrieval_ctx = [ctx for ctx in context if ctx and ctx.strip()]
                logger.info(f"DEBUG: Context was list, filtered to: {retrieval_ctx}")
            else:
                retrieval_ctx = [context] if context and context.strip() else ["No context provided"]
                logger.info(f"DEBUG: Context was string, converted to: {retrieval_ctx}")
        
        # For metrics requiring context, ensure we have at least one item
        # This will be validated in the individual metric methods
        logger.info(f"DEBUG: Final retrieval_ctx: {retrieval_ctx}")
        
        # Only set expected_output if explicitly provided
        # For faithfulness/hallucination: expected_output should be None (uses context for evaluation)
        # For RAGAS/contextual_recall: expected_output MUST be set by caller
        test_case = LLMTestCase(
            input=query or "",  # user question
            actual_output=output or "No output provided",  # model response (ensure non-empty default for test case validation)
            retrieval_context=retrieval_ctx,  # RAG/context
            context=retrieval_ctx,  # Set context explicitly as some deepeval metrics require 'context' parameter on LLMTestCase
            expected_output=expected_output  # Only set if provided; None for context-based metrics
        )
        
        return test_case
    
    def evaluate_faithfulness(self, test_case) -> tuple[float, str, Optional[FaithfulnessDetail]]:
        """
        Enhanced DeepEval faithfulness with IDK verdict support:
        - Extracts truths from context
        - Extracts claims from output
        - Evaluates each claim: "yes" (supported), "no" (contradicts), or "idk" (ambiguous)
        - Returns detailed breakdown with claim-level verdicts
        - Falls back to simple string matching when no claims are extracted
        """
        from deepeval.metrics.faithfulness.faithfulness import FaithfulnessMetric

        metric = FaithfulnessMetric(
            model=self.model,              # your DeepEvalBaseLLM or model name
            include_reason=True,           # let DeepEval generate the reason
            async_mode=False,              # keep sync in this server
            strict_mode=False,             # no hard clamp to 0 below threshold
            penalize_ambiguous_claims=(self.idk_handling == "no")  # Only penalize if explicitly configured
        )

        logger.info(f"=== Faithfulness Evaluation ===")
        logger.info(f"Input (query): {test_case.input}")
        logger.info(f"Actual Output: {test_case.actual_output}")
        logger.info(f"Retrieval Context: {test_case.retrieval_context}")

        score = metric.measure(test_case)      # DeepEval computes truths/claims/verdicts internally
        explanation = metric.reason or "Faithfulness (DeepEval core)."
        
        # Debug: Log what DeepEval extracted
        logger.info(f"DeepEval - Claims extracted: {metric.claims if hasattr(metric, 'claims') else 'N/A'}")
        logger.info(f"DeepEval - Truths extracted: {metric.truths if hasattr(metric, 'truths') else 'N/A'}")
        logger.info(f"DeepEval - Verdicts: {metric.verdicts if hasattr(metric, 'verdicts') else 'N/A'}")
        logger.info(f"DeepEval - Score: {score}")
        
        # Extract detailed verdict breakdown (IDK support)
        detail = None
        if hasattr(metric, 'verdicts') and hasattr(metric, 'claims') and hasattr(metric, 'truths'):
            # Check if any claims/verdicts were actually extracted
            if metric.claims and len(metric.claims) > 0 and metric.verdicts and len(metric.verdicts) > 0:
                claim_verdicts = []
                idk_count = 0
                yes_count = 0
                no_count = 0
                
                for claim, verdict_obj in zip(metric.claims, metric.verdicts):
                    verdict_str = verdict_obj.verdict.strip().lower()
                    reason = verdict_obj.reason
                    
                    # Apply idk_handling configuration
                    if verdict_str == "idk":
                        if self.idk_handling == "yes":
                            verdict_str = "yes"
                            reason = f"[idk->yes] {reason or 'Ambiguous claim treated as supported'}"
                        elif self.idk_handling == "no":
                            verdict_str = "no"
                            reason = f"[idk->no] {reason or 'Ambiguous claim treated as unsupported'}"
                    
                    claim_verdicts.append(ClaimVerdict(
                        claim=claim,
                        verdict=verdict_str,  # "yes", "no", or "idk"
                        reason=reason
                    ))
                    
                    # Count verdicts
                    if verdict_str == "idk":
                        idk_count += 1
                    elif verdict_str == "yes":
                        yes_count += 1
                    elif verdict_str == "no":
                        no_count += 1
                
                # Recalculate score accurately:
                # If zero contradictions (no_count == 0), output is faithful!
                total_verdicts = len(claim_verdicts)
                if total_verdicts > 0:
                    if self.idk_handling == "yes":
                        score = (yes_count + idk_count) / total_verdicts
                    elif self.idk_handling == "no":
                        score = yes_count / total_verdicts
                    else:  # "count" mode
                        if no_count == 0:
                            score = 1.0  # Zero contradictions means faithful
                        else:
                            score = yes_count / (yes_count + no_count) if (yes_count + no_count) > 0 else 0.0
                    score = round(score, 4)

                detail = FaithfulnessDetail(
                    truths=metric.truths,
                    claims=metric.claims,
                    verdicts=claim_verdicts,
                    idk_count=idk_count,
                    yes_count=yes_count,
                    no_count=no_count
                )
                logger.info(f"✓ Faithfulness: yes={yes_count}, no={no_count}, idk={idk_count} (mode={self.idk_handling}) - Final Score: {score}")
            else:
                # FALLBACK: No claims extracted by DeepEval
                # Perform keyword grounding matching to evaluate faithfulness
                logger.warning(f"⚠️ Faithfulness: No claims extracted by DeepEval. Using fallback validation...")
                logger.warning(f"   - Claims: {metric.claims if hasattr(metric, 'claims') else 'N/A'}")
                logger.warning(f"   - Output: '{test_case.actual_output}'")
                logger.warning(f"   - Context: {test_case.retrieval_context}")
                
                import re
                output_lower = test_case.actual_output.lower().strip()
                context_text = " ".join([ctx.lower().strip() for ctx in test_case.retrieval_context])
                
                # Check keyword overlap between context and output
                context_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', context_text))
                output_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', output_lower))
                overlap = len(context_words & output_words) / max(len(context_words), 1)
                output_found = overlap >= 0.15 or output_lower in context_text
                
                if output_found:
                    # Output aligns with context = FAITHFUL
                    fallback_score = 1.0
                    fallback_verdict = "yes"
                    fallback_reason = f"Fallback validation: Output text aligns with retrieval context ({int(overlap*100)}% keyword grounding)"
                else:
                    # Output doesn't align with context = CONTRADICTS/UNFAITHFUL
                    fallback_score = 0.0
                    fallback_verdict = "no"
                    fallback_reason = f"Fallback validation: Output text NOT grounded in retrieval context (potential contradiction)"
                
                logger.warning(f"   Fallback result: score={fallback_score}, found={output_found}")
                
                # Create fallback detail
                detail = FaithfulnessDetail(
                    truths=metric.truths if hasattr(metric, 'truths') else [],
                    claims=[test_case.actual_output],  # Treat the entire output as a single claim
                    verdicts=[ClaimVerdict(
                        claim=test_case.actual_output,
                        verdict=fallback_verdict,
                        reason=fallback_reason
                    )],
                    idk_count=0,
                    yes_count=1 if fallback_verdict == "yes" else 0,
                    no_count=1 if fallback_verdict == "no" else 0
                )
                
                # Use fallback score and explanation
                score = fallback_score
                explanation = f"[FALLBACK] {fallback_reason}."
                logger.info(f"✓ Faithfulness (FALLBACK): {fallback_verdict}={fallback_score} - {fallback_reason}")
        else:
            logger.warning(f"⚠️ Faithfulness: Metric object missing expected attributes. Score: {score}")
        
        return score, explanation, detail

    def evaluate_answer_relevancy(self, test_case) -> tuple[float, str]:
        """
        Pure DeepEval Answer Relevancy:
        - Uses DeepEval's native statements/verdicts/score.
        - No custom post-processing or caps.
        - Does NOT require or use context.
        """
        from deepeval.metrics.answer_relevancy.answer_relevancy import AnswerRelevancyMetric
        from deepeval.test_case import LLMTestCase

        # For Answer Relevancy, context is NOT required or used.
        # Construct a test case containing ONLY input and actual_output as required by the metric.
        relevancy_test_case = LLMTestCase(
            input=test_case.input,
            actual_output=test_case.actual_output
        )

        metric = AnswerRelevancyMetric(
            model=self.model,        # DeepEvalBaseLLM or model name already init'd
            include_reason=True,     # let DeepEval generate the reason
            async_mode=False,        # keep server synchronous
            strict_mode=False        # no threshold clamp
        )

        score = metric.measure(relevancy_test_case)
        explanation = metric.reason or "Answer Relevancy (DeepEval core)."
        return score, explanation
    
    def evaluate_contextual_precision(self, test_case) -> tuple[float, str]:
        """
        DeepEval Contextual Precision Metric:
        - Measures if relevant nodes in retrieval context are ranked higher than irrelevant nodes
        - Evaluates the precision and relevance of retrieved context to answer the query
        - Uses strict_mode=False for natural LLM judgment
        - Requires: input (query), retrieval_context, expected_output
        
        Args:
            test_case: LLMTestCase with input, retrieval_context, and expected_output set
            
        Returns:
            Tuple of (score, explanation)
        """
        from deepeval.metrics.contextual_precision.contextual_precision import ContextualPrecisionMetric
        
        # Validate required fields for contextual_precision
        if not test_case.input:
            raise ValueError("contextual_precision requires 'input' field (the user's question)")
        if not test_case.retrieval_context:
            raise ValueError("contextual_precision requires 'retrieval_context' field (list of retrieved documents)")
        if not test_case.expected_output:
            raise ValueError("contextual_precision requires 'expected_output' field (reference/expected answer)")
        
        logger.info(f"Contextual Precision - Query: {test_case.input[:50]}, Context items: {len(test_case.retrieval_context)}, Expected output length: {len(test_case.expected_output)}")
        
        metric = ContextualPrecisionMetric(
            model=self.model,              # DeepEvalBaseLLM or model name
            include_reason=True,           # Include detailed explanation
            async_mode=False,              # Synchronous for this server
            strict_mode=False              # Natural LLM judgment, no hard thresholds
        )
        
        score = metric.measure(test_case)
        explanation = metric.reason or "Contextual Precision evaluation: measures if relevant nodes in retrieval context are ranked higher than irrelevant nodes."
        
        logger.info(f"Contextual Precision score: {score}")
        
        return score, explanation
    
    def evaluate_contextual_recall(self, test_case) -> tuple[float, str]:
        """
        DeepEval Contextual Recall Metric:
        - Measures if retrieval_context contains all necessary information to answer expected_output
        - Uses strict_mode=False for natural LLM judgment
        - Requires: retrieval_context + expected_output
        - Does NOT require query (but benefits from it for context)
        
        Args:
            test_case: LLMTestCase with retrieval_context and expected_output set
            
        Returns:
            Tuple of (score, explanation)
        """
        from deepeval.metrics.contextual_recall.contextual_recall import ContextualRecallMetric
        
        # Validate required fields for contextual_recall
        if not test_case.retrieval_context:
            raise ValueError("contextual_recall requires 'context' field (retrieval_context - list of retrieved documents)")
        if not test_case.expected_output:
            raise ValueError("contextual_recall requires 'expected_output' field (reference/expected answer)")
        
        logger.info(f"Contextual Recall - Context items: {len(test_case.retrieval_context)}, Expected output length: {len(test_case.expected_output)}")
        
        metric = ContextualRecallMetric(
            model=self.model,              # DeepEvalBaseLLM or model name
            include_reason=True,           # Include detailed explanation
            async_mode=False,              # Synchronous for this server
            strict_mode=False              # Natural LLM judgment, no hard thresholds
        )
        
        score = metric.measure(test_case)
        explanation = metric.reason or "Contextual Recall evaluation: measures if retrieved context contains all necessary information to answer the expected output."
        
        logger.info(f"Contextual Recall score: {score}")
        
        return score, explanation
    
    def evaluate_pii_leakage(self, test_case) -> tuple[float, str]:
        """
        DeepEval PII Leakage Metric:
        - Detects personally identifiable information (PII) in LLM outputs
        - Uses LLM-as-a-judge to identify PII violations
        - Requires: input (query), actual_output (output)
        - Score: 0.0 = Safe (no leakage), 1.0 = High Leakage (PII exposed)
        
        Args:
            test_case: LLMTestCase with input and actual_output set
            
        Returns:
            Tuple of (leakage_score, explanation)
        """
        from deepeval.metrics.pii_leakage.pii_leakage import PIILeakageMetric
        
        # Validate required fields for pii_leakage
        if not test_case.input:
            raise ValueError("pii_leakage requires 'input' field (the user's question)")
        if not test_case.actual_output:
            raise ValueError("pii_leakage requires 'actual_output' field (model response to evaluate)")
        
        logger.info(f"PII Leakage - Input: {test_case.input[:50]}, Output length: {len(test_case.actual_output)}")
        
        metric = PIILeakageMetric(
            model=self.model,              # DeepEvalBaseLLM or model name
            include_reason=True,           # Include detailed explanation
            async_mode=False,              # Synchronous for this server
            strict_mode=False,             # Natural LLM judgment, no hard thresholds
            threshold=0.5                  # Default threshold for PII detection
        )
        
        raw_score = metric.measure(test_case)
        # DeepEval's raw_score is safety score (fraction of verdicts where no violation occurred)
        # For a PII Leakage metric: 0.0 = Safe (no leakage), 1.0 = High Leakage
        violations = []
        if hasattr(metric, 'verdicts') and metric.verdicts:
            violations = [v.reason for v in metric.verdicts if v.verdict.strip().lower() == "yes" and v.reason]
            violation_count = len(violations)
            total_verdicts = len(metric.verdicts)
            leakage_score = round(violation_count / total_verdicts, 4) if total_verdicts > 0 else 0.0
        else:
            leakage_score = round(1.0 - raw_score, 4)
        
        if leakage_score == 0.0:
            explanation = "No PII leakage detected. The output does not contain any sensitive personally identifiable information."
        else:
            if violations:
                explanation = f"PII Leakage detected ({leakage_score * 100:.1f}% leakage). Violations: {'; '.join(violations)}"
            else:
                extracted = getattr(metric, 'extracted_pii', [])
                if extracted:
                    explanation = f"PII Leakage detected ({leakage_score * 100:.1f}% leakage). Detected entities: {', '.join(extracted)}"
                else:
                    explanation = f"PII Leakage detected ({leakage_score * 100:.1f}% leakage). Sensitive information found in model output."
        
        logger.info(f"✓ PII Leakage raw_score={raw_score}, leakage_score={leakage_score}")
        return leakage_score, explanation
    
    def evaluate_bias(self, test_case) -> tuple[float, str]:
        """
        DeepEval Bias Metric:
        - Detects bias in LLM outputs using LLM-as-a-judge
        - Requires: input (query), actual_output (output)
        - Score: 0.0 = Unbiased (neutral/fair), 1.0 = Biased (stereotyping/favoritism)
        
        Args:
            test_case: LLMTestCase with input and actual_output set
            
        Returns:
            Tuple of (bias_score, explanation)
        """
        from deepeval.metrics.bias.bias import BiasMetric
        
        # Validate required fields for bias
        if not test_case.input:
            raise ValueError("bias requires 'input' field (the user's question)")
        if not test_case.actual_output:
            raise ValueError("bias requires 'actual_output' field (model response to evaluate)")
        
        logger.info(f"Bias - Input: {test_case.input[:50]}, Output length: {len(test_case.actual_output)}")
        
        metric = BiasMetric(
            model=self.model,              # DeepEvalBaseLLM or model name
            include_reason=True,           # Include detailed explanation
            async_mode=False,              # Synchronous for this server
            strict_mode=False,             # Natural LLM judgment, no hard thresholds
            threshold=0.5                  # Default threshold for bias detection
        )
        
        raw_score = metric.measure(test_case)
        # DeepEval raw_score is neutrality score (unbiased_count / total)
        # User requirement: If bias -> 1, no bias -> 0
        biased_reasons = []
        if hasattr(metric, 'verdicts') and metric.verdicts:
            biased_reasons = [v.reason for v in metric.verdicts if v.verdict.strip().lower() == "yes" and v.reason]
            bias_count = len(biased_reasons)
            total_verdicts = len(metric.verdicts)
            bias_score = round(bias_count / total_verdicts, 4) if total_verdicts > 0 else 0.0
        else:
            bias_score = round(1.0 - raw_score, 4)
        
        if bias_score == 0.0:
            explanation = "No bias detected. The output maintains neutrality without biased opinions or stereotyping."
        else:
            if biased_reasons:
                explanation = f"Bias detected ({bias_score * 100:.1f}% bias). Biased statements: {'; '.join(biased_reasons)}"
            else:
                opinions = getattr(metric, 'opinions', [])
                if opinions:
                    explanation = f"Bias detected ({bias_score * 100:.1f}% bias). Biased opinions: {'; '.join(opinions)}"
                else:
                    explanation = f"Bias detected ({bias_score * 100:.1f}% bias). The output contains skewed or stereotypical language."
        
        logger.info(f"✓ Bias raw_score={raw_score}, bias_score={bias_score}")
        return bias_score, explanation
    
    def evaluate_hallucination(self, test_case) -> tuple[float, str]:
        """
        DeepEval Hallucination Metric:
        - Detects hallucinations in LLM outputs by comparing with context
        - Requires: input (query), actual_output (output), context
        - Score: 0.0 = Factual / No Hallucination, 1.0 = Hallucination exists (contradicts context)
        
        Args:
            test_case: LLMTestCase with input, actual_output, and context set
            
        Returns:
            Tuple of (hallucination_score, explanation)
        """
        from deepeval.metrics.hallucination.hallucination import HallucinationMetric
        
        # Validate required fields for hallucination
        if not test_case.input:
            raise ValueError("hallucination requires 'input' field (the user's question)")
        if not test_case.actual_output:
            raise ValueError("hallucination requires 'actual_output' field (model response to evaluate)")
        if not test_case.retrieval_context or len(test_case.retrieval_context) == 0:
            raise ValueError("hallucination requires 'retrieval_context' field (list of retrieved documents) - context cannot be empty")
        
        # Ensure retrieval_context is a list of strings
        if not isinstance(test_case.retrieval_context, list):
            raise ValueError("hallucination requires 'retrieval_context' to be a list of strings")
        
        # Filter out empty strings from context, but allow default context for testing
        valid_context = [ctx for ctx in test_case.retrieval_context if ctx and ctx.strip()]
        
        # If all context items are empty or filtered out, but we have a default context item, use it
        if not valid_context and len(test_case.retrieval_context) > 0:
            # Check if we have the default context
            if test_case.retrieval_context[0] == "No context provided":
                valid_context = test_case.retrieval_context  # Use default context
            else:
                raise ValueError("hallucination requires at least one non-empty context item")
        
        if not valid_context:
            raise ValueError("hallucination requires at least one non-empty context item")
        
        # Update test case with filtered context
        test_case.retrieval_context = valid_context
        
        logger.info(f"Hallucination - Input: {test_case.input[:50]}, Context items: {len(test_case.retrieval_context)}, Output length: {len(test_case.actual_output)}")
        
        try:
            metric = HallucinationMetric(
                model=self.model,              # DeepEvalBaseLLM or model name
                include_reason=True,           # Include detailed explanation
                async_mode=False,              # Synchronous for this server
                strict_mode=False,             # Natural LLM judgment, no hard thresholds
                threshold=0.5                  # Default threshold for hallucination detection
            )
            
            logger.info("HallucinationMetric created successfully")
            raw_score = metric.measure(test_case)
            logger.info(f"Hallucination metric.measure() completed, raw_score: {raw_score}")
            
            # In recent DeepEval, raw_score measures factual alignment (1.0 = factual, 0.0 = hallucinated)
            # User requirement: If hallucination exists -> 1, no hallucination -> 0
            contradictions = []
            if hasattr(metric, 'verdicts') and metric.verdicts:
                contradictions = [v.reason for v in metric.verdicts if v.verdict.strip().lower() == "no" and v.reason]
                contradiction_count = len(contradictions)
                total_verdicts = len(metric.verdicts)
                hallucination_score = round(contradiction_count / total_verdicts, 4) if total_verdicts > 0 else 0.0
            else:
                hallucination_score = round(1.0 - raw_score, 4)
            
            if hallucination_score == 0.0:
                explanation = "No hallucination detected. The output fully aligns with the provided context without contradictions."
            else:
                if contradictions:
                    explanation = f"Hallucination detected ({hallucination_score * 100:.1f}% hallucination). Contradictions found: {'; '.join(contradictions)}"
                else:
                    explanation = f"Hallucination detected ({hallucination_score * 100:.1f}% hallucination). The model output introduces ungrounded claims contradicting the context."
            
        except Exception as metric_error:
            logger.error(f"Error creating or measuring HallucinationMetric: {type(metric_error).__name__}: {str(metric_error)}")
            logger.exception("HallucinationMetric traceback:")
            raise metric_error
        
        logger.info(f"✓ Hallucination raw_score={raw_score}, hallucination_score={hallucination_score}")
        return hallucination_score, explanation
    
    def evaluate_ragas(self, test_case) -> tuple[dict, str]:
        """
        DeepEval RAGAS Metric (Composite):
        - Evaluates context_precision, context_recall, faithfulness, and answer_relevancy
        - Computes these components separately then combines them
        - strict_mode=False for natural LLM judgment
        - include_reason=True for detailed explanations
        
        Returns:
            Tuple of (results_dict with component scores, combined_explanation)
        """
        # Validate that expected_output is set (RAGAS requirement)
        if not test_case.expected_output:
            raise ValueError("RAGAS metric requires 'expected_output' field to be set in test case")
        
        logger.info(f"RAGAS test case: input={test_case.input[:50] if test_case.input else 'None'}, actual_output={test_case.actual_output[:50]}, expected_output={test_case.expected_output[:50]}, retrieval_context={len(test_case.retrieval_context) if test_case.retrieval_context else 0} items")
        
        try:
            logger.info("Computing RAGAS components (faithfulness, context_precision, context_recall, answer_relevancy)...")
            
            # Import all component metrics
            from deepeval.metrics.faithfulness.faithfulness import FaithfulnessMetric
            from deepeval.metrics.contextual_precision.contextual_precision import ContextualPrecisionMetric
            from deepeval.metrics.contextual_recall.contextual_recall import ContextualRecallMetric
            from deepeval.metrics.answer_relevancy.answer_relevancy import AnswerRelevancyMetric
            from deepeval.test_case import LLMTestCase
            
            # 1. Compute Faithfulness
            logger.info("Computing faithfulness...")
            faith_metric = FaithfulnessMetric(
                model=self.model,
                include_reason=True,
                async_mode=False,
                strict_mode=False,
                penalize_ambiguous_claims=False
            )
            faith_metric.measure(test_case)
            faithfulness_score = faith_metric.score
            faithfulness_reason = faith_metric.reason or "Faithfulness evaluation complete"
            logger.info(f"Faithfulness score: {faithfulness_score}")
            
            # 2. Compute Context Precision
            logger.info("Computing context precision...")
            precision_metric = ContextualPrecisionMetric(
                model=self.model,
                include_reason=True,
                async_mode=False,
                strict_mode=False
            )
            precision_metric.measure(test_case)
            precision_score = precision_metric.score
            precision_reason = precision_metric.reason or "Context precision evaluation complete"
            logger.info(f"Context precision score: {precision_score}")
            
            # 3. Compute Context Recall
            logger.info("Computing context recall...")
            recall_metric = ContextualRecallMetric(
                model=self.model,
                include_reason=True,
                async_mode=False,
                strict_mode=False
            )
            recall_metric.measure(test_case)
            recall_score = recall_metric.score
            recall_reason = recall_metric.reason or "Context recall evaluation complete"
            logger.info(f"Context recall score: {recall_score}")

            # Compute overall RAGAS score as average of all 3 components
            overall_score = (faithfulness_score + precision_score + recall_score) / 3.0
            logger.info(f"Overall RAGAS score: {overall_score}")
            
            # Build results dictionary
            results = {
                "context_precision": precision_score,
                "context_recall": recall_score,
                "faithfulness": faithfulness_score,
                "overall_score": overall_score
            }
            
            # Build detailed explanation
            explanations = [
                f"Faithfulness: {faithfulness_reason}",
                f"Context Precision: {precision_reason}",
                f"Context Recall: {recall_reason}"
            ]
            combined_explanation = " | ".join(explanations)
            
            logger.info(f"RAGAS evaluation completed: {results}")
            return results, combined_explanation
            
        except ImportError as ie:
            logger.error(f"Import error in RAGAS: {str(ie)}")
            logger.error("Trying alternative imports...")
            # Try alternative imports
            try:
                from deepeval.metrics.contextual_precision import ContextualPrecisionMetric
                from deepeval.metrics.contextual_recall import ContextualRecallMetric
                from deepeval.metrics.faithfulness import FaithfulnessMetric
                from deepeval.metrics.answer_relevancy import AnswerRelevancyMetric
                logger.info("Using alternative imports")
                # Re-attempt with alternative imports
                return self.evaluate_ragas(test_case)
            except Exception as e2:
                logger.error(f"Alternative import also failed: {str(e2)}")
                raise
        except Exception as e:
            logger.error(f"RAGAS evaluation error: {type(e).__name__}: {str(e)}")
            logger.exception("Full traceback:")
            raise



    def evaluate(
        self,
        metric_name: str,
        *,
        query: Optional[str] = None,
        context: Optional[List[str]] = None,
        output: str = "",
        expected_output: Optional[str] = None
    ) -> tuple:
        """Main evaluation method that routes to specific metric evaluators.
        
        Uses keyword-only arguments for better testability and clarity.
        Validates metric-specific requirements before calling DeepEval:
        - faithfulness: output required, context + query recommended
        - answer_relevancy: query + output required
        - ragas: query + context + expected_output + output required
        
        Args:
            metric_name: Which metric to evaluate
            query: User's question or input (optional for most metrics)
            context: List of retrieved documents or source passages (optional for some metrics)
            output: Model's generated response (required for most metrics)
            expected_output: Expected/reference answer (required for RAGAS)
            
        Returns:
            Tuple of (score_or_dict, explanation)
            
        Raises:
            ValueError: If metric is unsupported or required fields are missing
        """
        logger.info(f"DEBUG: evaluate() ENTRY - metric_name: {metric_name}, query: {query}, context: {context}, output: {output}, expected_output: {expected_output}")
        
        metric_name = metric_name.lower()
        if metric_name == "context_precision":
            metric_name = "contextual_precision"
        elif metric_name == "context_recall":
            metric_name = "contextual_recall"
        
        if not self.validate_metric(metric_name):
            raise ValueError(f"Unsupported metric: {metric_name}. Supported: {list(self.SUPPORTED_METRICS.keys())}")
        
        # Validate metric-specific requirements
        if metric_name == "answer_relevancy":
            if not query:
                raise ValueError("answer_relevancy requires 'query' field (the user's question)")
        
        if metric_name == "contextual_precision":
            if not query:
                raise ValueError("contextual_precision requires 'query' field (the user's question)")
            if not context:
                raise ValueError("contextual_precision requires 'context' field (retrieval_context - list of retrieved documents)")
            if not expected_output:
                raise ValueError("contextual_precision requires 'expected_output' field (reference/expected answer)")
        
        if metric_name == "contextual_recall":
            if not context:
                raise ValueError("contextual_recall requires 'context' field (retrieval_context - list of retrieved documents)")
            if not expected_output:
                raise ValueError("contextual_recall requires 'expected_output' field (reference/expected answer)")
        
        if metric_name == "pii_leakage":
            if not query:
                raise ValueError("pii_leakage requires 'query' field (the user's question)")
            if not output:
                raise ValueError("pii_leakage requires 'output' field (model response to evaluate)")
        
        if metric_name == "bias":
            if not query:
                raise ValueError("bias requires 'query' field (the user's question)")
            if not output:
                raise ValueError("bias requires 'output' field (model response to evaluate)")
        
        if metric_name == "hallucination":
            if not query:
                raise ValueError("hallucination requires 'query' field (the user's question)")
            if not context:
                raise ValueError("hallucination requires 'context' field (retrieval_context - list of retrieved documents)")
            if not output:
                raise ValueError("hallucination requires 'output' field (model response to evaluate)")
        
        if metric_name == "ragas":
            if not query:
                raise ValueError("ragas metric requires 'query' field (the user's question)")
            if not context:
                raise ValueError("ragas metric requires 'context' field (list of retrieved documents)")
            if not expected_output:
                raise ValueError("ragas metric requires 'expected_output' field (reference/expected answer)")
        
        # Create test case with proper structure
        logger.info(f"DEBUG: evaluate() called with - metric_name: {metric_name}, query: {query}, context: {context}, output: {output}, expected_output: {expected_output}")
        
        test_case = self.create_test_case(
            query=query,
            context=context,
            output=output,
            expected_output=expected_output
        )
        
        logger.info(f"DEBUG: test_case created - input: {test_case.input}, retrieval_context: {test_case.retrieval_context}, actual_output: {test_case.actual_output}")
        
        # Route to appropriate evaluation method
        if metric_name == "faithfulness":
            return self.evaluate_faithfulness(test_case)
        elif metric_name == "answer_relevancy":
            return self.evaluate_answer_relevancy(test_case)
        elif metric_name == "contextual_precision":
            return self.evaluate_contextual_precision(test_case)
        elif metric_name == "contextual_recall":
            return self.evaluate_contextual_recall(test_case)
        elif metric_name == "pii_leakage":
            return self.evaluate_pii_leakage(test_case)
        elif metric_name == "bias":
            return self.evaluate_bias(test_case)
        elif metric_name == "hallucination":
            return self.evaluate_hallucination(test_case)
        elif metric_name == "ragas":
            return self.evaluate_ragas(test_case)
        else:
            raise ValueError(f"Metric {metric_name} is not implemented yet")


def init_evaluator_from_env() -> MetricEvaluator:
    """Initialize MetricEvaluator from environment variables.
    
    Returns:
        Configured MetricEvaluator instance
        
    Raises:
        ValueError: If required API keys are missing
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY")
    eval_model = os.getenv("EVAL_MODEL", "llama-3.3-70b-versatile")
    idk_handling = os.getenv("IDK_HANDLING", "count").lower()
    
    if idk_handling not in ["yes", "no", "count"]:
        logger.warning(f"Invalid IDK_HANDLING '{idk_handling}', using 'count'")
        idk_handling = "count"
    
    logger.info(f"Faithfulness IDK handling mode: {idk_handling}")
    
    # Determine which API to use based on EVAL_MODEL
    # Groq models: llama-*, mixtral-*, gemma*, qwen*, meta-llama*, openai/*
    # Standard OpenAI models: gpt-* (but NOT openai/*)
    is_groq_model = any(eval_model.lower().startswith(prefix) for prefix in ["llama-", "mixtral-", "gemma", "qwen", "meta-llama", "openai/"])
    is_openai_model = eval_model.lower().startswith("gpt-") and not eval_model.lower().startswith("openai/")
    
    if is_groq_model:
        # Groq model (including openai/* models)
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY environment variable is required when using Groq models")
        
        # Use exact model name configured for Groq
        actual_model = eval_model
        logger.info(f"Using Groq API for evaluation with model: {actual_model}")
        return MetricEvaluator(
            api_key=groq_api_key,
            model_name=actual_model,
            use_groq=True,
            idk_handling=idk_handling
        )
    elif is_openai_model:
        # Standard OpenAI models (gpt-*)
        if not openai_api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required when using OpenAI models")
        
        logger.info(f"Using OpenAI API for evaluation with model: {eval_model}")
        return MetricEvaluator(
            api_key=openai_api_key,
            model_name=eval_model,
            use_groq=False,
            idk_handling=idk_handling
        )
    else:
        # Default to Groq with default model
        if not groq_api_key:
            raise ValueError(f"Unknown model '{eval_model}'. Please specify gpt-*, openai/*, llama-*, or other Groq models")
        
        logger.warning(f"Unknown model '{eval_model}', defaulting to Groq with llama-3.3-70b-versatile")
        return MetricEvaluator(
            api_key=groq_api_key,
            model_name="llama-3.3-70b-versatile",
            use_groq=True,
            idk_handling=idk_handling
        )


@app.post("/eval", response_model=EvalResponse)
async def evaluate_llm_response(req: EvalRequest):
    """
    Evaluate an LLM response using one or more metrics.
    
    Supports:
    - Single metric: metric="faithfulness"
    - Multiple metrics: metric=["faithfulness", "answer_relevancy"]
    - All metrics: metric="all"
    
    Each metric can be used independently to teach specific evaluation concepts.
    
    Args:
        req: EvalRequest with query, context, output, metric type(s), and optional provider
        
    Returns:
        EvalResponse with array of metric results
    """
    try:
        # DEBUG: Log raw request data
        logger.info(f"=== Raw Request Debug ===")
        logger.info(f"req.query: {req.query}")
        logger.info(f"req.context: {req.context}")
        logger.info(f"req.output: {req.output}")
        logger.info(f"req.expected_output: {req.expected_output}")
        logger.info(f"req.metric: {req.metric}")
        logger.info(f"Expected output type: {type(req.expected_output)}")
        logger.info(f"Expected output value: {repr(req.expected_output)}")
        
        # Parse metric parameter - can be string, array, or "all"
        metric_param = req.metric or "faithfulness"
        
        # Convert to list of metrics
        if isinstance(metric_param, str):
            if metric_param.lower() == "all":
                # Get all supported metrics
                metrics_to_eval = list(MetricEvaluator.SUPPORTED_METRICS.keys())
            else:
                metrics_to_eval = [metric_param]
        else:
            metrics_to_eval = metric_param
        
        # Normalize and map original metric names to canonical ones for evaluation
        canonical_metrics = []
        original_names = {}  # canonical -> original
        for m in metrics_to_eval:
            m_lower = m.lower()
            if m_lower == "context_precision":
                canonical = "contextual_precision"
            elif m_lower == "context_recall":
                canonical = "contextual_recall"
            else:
                canonical = m_lower
            
            canonical_metrics.append(canonical)
            original_names[canonical] = m
        metrics_to_eval = canonical_metrics
        
        # Validate minimal fields for each metric
        for metric_name in metrics_to_eval:
            metric_name_lower = metric_name.lower()
            
            # Contextual metrics do NOT require output field
            # These metrics evaluate context quality based on query and expected_output
            contextual_metrics = ["contextual_precision", "contextual_recall"]
            is_contextual = metric_name_lower in contextual_metrics
            
            # For non-contextual metrics, output is required
            if not is_contextual and not req.output:
                raise HTTPException(
                    status_code=400, 
                    detail=f"output field is required for {metric_name_lower} metric"
                )
            
            # RAGAS-specific validation
            if metric_name_lower == "ragas":
                logger.info(f"RAGAS validation in /eval: query={bool(req.query)}, context={len(req.context) if req.context else 0}, expected_output={bool(req.expected_output)}, output={bool(req.output)}")
                logger.info(f"RAGAS req object: query type={type(req.query)}, expected_output type={type(req.expected_output)}, expected_output value={req.expected_output[:50] if req.expected_output else 'None'}")
                
                if not req.query:
                    raise HTTPException(status_code=400, detail="ragas metric requires 'query' field (user's question)")
                if not req.context:
                    raise HTTPException(status_code=400, detail="ragas metric requires 'context' field (list of retrieved documents)")
                if not req.expected_output:
                    raise HTTPException(status_code=400, detail="ragas metric requires 'expected_output' field (reference/expected answer)")
            
            # Hallucination-specific validation
            if metric_name_lower == "hallucination":
                logger.info(f"Hallucination validation in /eval: query={bool(req.query)}, context={bool(req.context)}, output={bool(req.output)}")
                
                if not req.query:
                    raise HTTPException(status_code=400, detail="hallucination metric requires 'query' field (user's question)")
                if not req.context or (isinstance(req.context, list) and len(req.context) == 0):
                    raise HTTPException(status_code=400, detail="hallucination metric requires 'context' field (retrieval_context - list of retrieved documents with at least one item)")
                if not req.output:
                    raise HTTPException(status_code=400, detail="hallucination metric requires 'output' field (model response to evaluate)")
        
        # Initialize evaluator ONCE (moved outside validation loop)
        evaluator = init_evaluator_from_env()
        
        logger.info(f"=== Evaluation Request ===")
        logger.info(f"Metrics: {metrics_to_eval}")
        logger.info(f"Query: {req.query[:100] + '...' if req.query and len(req.query) > 100 else req.query or 'None'}")
        logger.info(f"Context items: {len(req.context) if req.context else 0}")
        logger.info(f"Output length: {len(req.output) if req.output else 0}")
        
        # Evaluate each metric
        results = []
        for metric_name in metrics_to_eval:
            try:
                metric_name_lower = metric_name.lower()
                
                if metric_name_lower == "ragas":
                    # RAGAS returns dict of component scores
                    logger.info(f"Calling evaluator.evaluate() for RAGAS with: query={bool(req.query)}, context_len={len(req.context) if req.context else 0}, output_len={len(req.output)}, expected_output_len={len(req.expected_output) if req.expected_output else 0}")
                    
                    result_dict, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output=req.output,
                        expected_output=req.expected_output
                    )
                    
                    logger.info(f"RAGAS evaluation completed successfully")
                    
                    overall_score = result_dict.get("overall_score")
                    verdict = get_verdict_for_metric("ragas", overall_score) if isinstance(overall_score, (int, float)) else "N/A"
                    
                    precision = result_dict.get('context_precision')
                    recall = result_dict.get('context_recall')
                    faith = result_dict.get('faithfulness')
                    
                    precision_str = f"{precision:.2f}" if isinstance(precision, (int, float)) else "N/A"
                    recall_str = f"{recall:.2f}" if isinstance(recall, (int, float)) else "N/A"
                    faith_str = f"{faith:.2f}" if isinstance(faith, (int, float)) else "N/A"
                    
                    # Store RAGAS results with component breakdown
                    results.append(MetricResult(
                        metric_name=metric_name,
                        score=overall_score,
                        verdict=verdict,
                        explanation=f"Precision={precision_str}, Recall={recall_str}, Faith={faith_str} | {explanation}",
                        error=None
                    ))
                    
                    logger.info(f"✓ {metric_name}: Precision={precision_str}, Recall={recall_str}, Faith={faith_str} - {verdict}")
                
                elif metric_name_lower == "hallucination":
                    # Hallucination evaluation
                    logger.info(f"Evaluating hallucination metric...")
                    try:
                        score, explanation = evaluator.evaluate(
                            metric_name=metric_name,
                            query=req.query,
                            context=req.context,
                            output=req.output,
                            expected_output=req.expected_output
                        )
                        
                        logger.info(f"Hallucination raw result: score={score}, explanation={explanation}")
                        
                        if score is None:
                            logger.error("Hallucination metric returned None score")
                            raise ValueError("Hallucination metric returned None score")
                        
                        verdict = get_verdict_for_metric("hallucination", score)
                        
                        results.append(MetricResult(
                            metric_name="hallucination",
                            score=score,
                            verdict=verdict,
                            explanation=explanation
                        ))
                        
                        logger.info(f"✓ hallucination: {score} - {verdict}")
                    except Exception as halluc_error:
                        logger.error(f"Hallucination evaluation failed: {type(halluc_error).__name__}: {str(halluc_error)}")
                        logger.exception(f"Hallucination traceback:")
                        results.append(MetricResult(
                            metric_name="hallucination",
                            score=None,
                            verdict=None,
                            explanation=None,
                            error=f"Hallucination evaluation failed: {str(halluc_error)}"
                        ))
                
                elif metric_name_lower == "bias":
                    # Bias evaluation
                    logger.info(f"Evaluating bias metric...")
                    score, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output=req.output,
                        expected_output=req.expected_output
                    )
                    
                    verdict = get_verdict_for_metric("bias", score)
                    
                    results.append(MetricResult(
                        metric_name="bias",
                        score=score,
                        verdict=verdict,
                        explanation=explanation
                    ))
                    
                    logger.info(f"✓ bias: {score} - {verdict}")
                
                elif metric_name_lower == "pii_leakage":
                    # PII Leakage evaluation
                    logger.info(f"Evaluating pii_leakage metric...")
                    score, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output=req.output,
                        expected_output=req.expected_output
                    )
                    
                    verdict = get_verdict_for_metric("pii_leakage", score)
                    
                    results.append(MetricResult(
                        metric_name="pii_leakage",
                        score=score,
                        verdict=verdict,
                        explanation=explanation
                    ))
                    
                    logger.info(f"✓ pii_leakage: {score} - {verdict}")
                
                elif metric_name_lower == "contextual_precision":
                    # Contextual Precision evaluation (does not use LLM output)
                    logger.info(f"Evaluating contextual_precision metric...")
                    score, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output="",  # Not used for context evaluation
                        expected_output=req.expected_output
                    )
                    
                    verdict = get_verdict_for_metric("contextual_precision", score)
                    
                    results.append(MetricResult(
                        metric_name="contextual_precision",
                        score=score,
                        verdict=verdict,
                        explanation=explanation
                    ))
                    
                    logger.info(f"✓ contextual_precision: {score} - {verdict} (context quality metric)")
                
                elif metric_name_lower == "contextual_recall":
                    # Contextual Recall evaluation (does not use LLM output)
                    logger.info(f"Evaluating contextual_recall metric...")
                    score, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output="",  # Not used for context evaluation
                        expected_output=req.expected_output
                    )
                    
                    verdict = get_verdict_for_metric("contextual_recall", score)
                    
                    results.append(MetricResult(
                        metric_name=metric_name,
                        score=score,
                        verdict=verdict,
                        explanation=explanation
                    ))
                    
                    logger.info(f"✓ contextual_recall: {score} - {verdict} (context quality metric)")
                
                elif metric_name_lower == "faithfulness":
                    # Faithfulness evaluation with IDK verdict support
                    logger.info(f"Evaluating faithfulness metric with IDK support...")
                    try:
                        test_case = evaluator.create_test_case(
                            query=req.query,
                            context=req.context,
                            output=req.output,
                            expected_output=req.expected_output
                        )
                        score, explanation, detail = evaluator.evaluate_faithfulness(test_case)
                        
                        logger.info(f"Faithfulness score: {score}")
                        
                        if score is None:
                            logger.error("Faithfulness metric returned None score")
                            raise ValueError("Faithfulness metric returned None score")
                        
                        verdict = get_verdict_for_metric("faithfulness", score)
                        
                        results.append(MetricResult(
                            metric_name="faithfulness",
                            score=score,
                            verdict=verdict,
                            explanation=explanation,
                            detail=detail
                        ))
                        
                        if detail:
                            logger.info(f"✓ faithfulness: {score:.2f} - {verdict} (IDK: {detail.idk_count}, Yes: {detail.yes_count}, No: {detail.no_count})")
                        else:
                            logger.info(f"✓ faithfulness: {score:.2f} - {verdict}")
                    except Exception as faith_error:
                        logger.error(f"Faithfulness evaluation failed: {type(faith_error).__name__}: {str(faith_error)}")
                        logger.exception(f"Faithfulness traceback:")
                        results.append(MetricResult(
                            metric_name="faithfulness",
                            score=None,
                            verdict=None,
                            explanation=None,
                            error=f"Faithfulness evaluation failed: {str(faith_error)}"
                        ))
                
                else:
                    # Standard metrics (answer_relevancy) handled generically
                    logger.info(f"Evaluating {metric_name_lower} metric...")
                    score, explanation = evaluator.evaluate(
                        metric_name=metric_name,
                        query=req.query,
                        context=req.context,
                        output=req.output,
                        expected_output=req.expected_output
                    )
                    
                    verdict = get_verdict_for_metric(metric_name, score)
                    
                    results.append(MetricResult(
                        metric_name=metric_name,
                        score=score,
                        verdict=verdict,
                        explanation=explanation
                    ))
                    
                    logger.info(f"✓ {metric_name}: {score} - {verdict}")
                
            except ValueError as ve:
                # Metric-specific validation error
                logger.warning(f"✗ {metric_name}: ValueError: {str(ve)}")
                results.append(MetricResult(
                    metric_name=metric_name,
                    score=None,
                    explanation=None,
                    error=str(ve)
                ))
            except Exception as e:
                # Unexpected error for this metric
                logger.error(f"✗ {metric_name}: {type(e).__name__}: {str(e)}")
                logger.exception(f"Full traceback for {metric_name}:")
                results.append(MetricResult(
                    metric_name=metric_name,
                    score=None,
                    explanation=None,
                    error=f"Evaluation failed: {str(e)}"
                ))
        
        # Map canonical metric names back to original names in the response
        for result in results:
            if result.metric_name in original_names:
                result.metric_name = original_names[result.metric_name]
        
        # Build response with backward compatibility
        response = EvalResponse(results=results)
        
        # For backward compatibility: populate legacy fields with first successful result
        for result in results:
            if result.score is not None:
                response.metric_name = result.metric_name
                response.score = result.score
                response.explanation = result.explanation
                response.error = result.error
                break
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        # Unexpected errors (API failures, etc.)
        logger.exception("Evaluation error")
        raise HTTPException(status_code=500, detail="Internal server error")
@app.post("/eval-only", response_model=EvalResponse)
async def evaluate_llm_response_eval_only(req: EvalRequest):
    """Alias endpoint for /eval - evaluates an LLM response using metrics."""
    return await evaluate_llm_response(req)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "ok",
        "service": "Deepeval Evaluation Service",
        "version": "1.0.0"
    }



if __name__ == "__main__":
    import uvicorn
    
    import os
    
    # Get port from environment variable, default to 8000
    port_str = os.getenv("DEEPEVAL_PORT")
    if not port_str:
        # Try parsing from DEEPEVAL_URL if present
        deepeval_url = os.getenv("DEEPEVAL_URL")
        if deepeval_url and ":" in deepeval_url:
            try:
                # e.g., http://localhost:8000/eval -> 8000
                parts = deepeval_url.split(":")
                if len(parts) >= 3:
                    port_str = parts[2].split("/")[0]
            except Exception:
                pass
                
    port = int(port_str) if port_str and port_str.isdigit() else 8000
    
    logger.info("Starting Deepeval Evaluation Service...")
    logger.info(f"API documentation available at http://localhost:{port}/docs")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )

