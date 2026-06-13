import os
import json
import logging
import tempfile
import uuid
import shutil
from datetime import datetime
from PIL import Image
import fitz  # PyMuPDF
from agent_framework import workflow, step, RunContext
from app.services.local_model import local_model_service
from app.db import save_message, save_attachment

logger = logging.getLogger("app.services.agent_workflow")

# ---------------------------------------------------------------------------
# Custom Document Tools
# ---------------------------------------------------------------------------

def convert_document_tool(file_path: str, target_format: str, session_id: str) -> str:
    """Converts a document between PDF and Image format.
    
    Args:
        file_path: Absolute path or filename in the session uploads folder.
        target_format: 'pdf', 'png', or 'jpg'.
        session_id: The active session ID.
    """
    logger.info(f"Converting document {file_path} to {target_format} in session {session_id}")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_dir = os.path.join(base_dir, "uploads", session_id)
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Resolve absolute path
    if not os.path.isabs(file_path):
        file_path = os.path.join(uploads_dir, os.path.basename(file_path))
        
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    filename = os.path.basename(file_path)
    base_name, ext = os.path.splitext(filename)
    target_format = target_format.lower()
    
    if target_format == "pdf":
        new_filename = f"{base_name}.pdf"
        dest_path = os.path.join(uploads_dir, new_filename)
        
        # Image -> PDF
        img = Image.open(file_path)
        img.convert('RGB').save(dest_path, 'PDF')
        logger.info(f"Converted image to PDF at {dest_path}")
        return f"/uploads/{session_id}/{new_filename}"
        
    elif target_format in ("png", "jpg", "jpeg"):
        new_filename = f"{base_name}.png"
        dest_path = os.path.join(uploads_dir, new_filename)
        
        # PDF -> Image (first page)
        doc = fitz.open(file_path)
        page = doc.load_page(0)
        pix = page.get_pixmap()
        pix.save(dest_path)
        logger.info(f"Converted PDF to image at {dest_path}")
        return f"/uploads/{session_id}/{new_filename}"
    else:
        raise ValueError(f"Unsupported target format: {target_format}")

def compress_document_tool(file_path: str, session_id: str) -> str:
    """Compresses a PDF or image file to reduce its size.
    
    Args:
        file_path: Absolute path or filename in the session uploads folder.
        session_id: The active session ID.
    """
    logger.info(f"Compressing document {file_path} in session {session_id}")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_dir = os.path.join(base_dir, "uploads", session_id)
    os.makedirs(uploads_dir, exist_ok=True)
    
    if not os.path.isabs(file_path):
        file_path = os.path.join(uploads_dir, os.path.basename(file_path))
        
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    filename = os.path.basename(file_path)
    base_name, ext = os.path.splitext(filename)
    
    new_filename = f"{base_name}_compressed{ext}"
    dest_path = os.path.join(uploads_dir, new_filename)
    
    if ext.lower() in (".png", ".jpg", ".jpeg"):
        # Image compression using Pillow
        img = Image.open(file_path)
        if ext.lower() in (".jpg", ".jpeg"):
            img.convert('RGB').save(dest_path, optimize=True, quality=50)
        else:
            img.save(dest_path, optimize=True)
        logger.info(f"Compressed image saved to {dest_path}")
        return f"/uploads/{session_id}/{new_filename}"
        
    elif ext.lower() == ".pdf":
        # PDF compression using PyMuPDF
        doc = fitz.open(file_path)
        doc.save(dest_path, garbage=4, deflate=True)
        logger.info(f"Compressed PDF saved to {dest_path}")
        return f"/uploads/{session_id}/{new_filename}"
    else:
        shutil.copy(file_path, dest_path)
        logger.info(f"Unsupported format copy saved to {dest_path}")
        return f"/uploads/{session_id}/{new_filename}"

# ---------------------------------------------------------------------------
# Workflow Steps
# ---------------------------------------------------------------------------

@step(name="plan_document_actions")
async def plan_document_actions(remote_response: str, files_list: list) -> list:
    """Analyzes requirements and files to produce a list of conversion/compression actions."""
    logger.info("Step 1: Planning document actions...")
    
    system_prompt = """You are Form Mitra's local agent planning assistant.
Analyze the required formats and sizes from the remote agent's response, and the uploaded documents list.
Identify if any uploaded file exceeds the maximum size or has the wrong file format (e.g. image vs pdf).
If yes, list the actions needed: 'compress' or 'convert' (to 'pdf' or 'png').

Response format:
You MUST respond with a valid JSON list of actions, like:
[
  {"action": "compress", "filename": "IMG_20241018_153346.jpg"},
  {"action": "convert", "filename": "New doc.jpg", "target_format": "pdf"}
]
If no actions are needed, return an empty list: []
Do not output any other text or reasoning. Start directly with the JSON brackets."""

    prompt = f"Remote Agent Response:\n{remote_response}\n\nUploaded Files:\n{json.dumps(files_list, indent=2)}"
    
    # Generate response
    response_text = ""
    try:
        stream = local_model_service.generate_stream(system_prompt, prompt)
        response_text = "".join(list(stream)).strip()
        logger.info(f"Planner response: {response_text}")
        
        # Parse JSON list
        # Strip any markdown backticks if returned
        if "```" in response_text:
            lines = response_text.split("\n")
            cleaned_lines = [l for l in lines if not l.startswith("```")]
            response_text = "\n".join(cleaned_lines).strip()
            
        actions = json.loads(response_text)
        if isinstance(actions, list):
            return actions
        return []
    except Exception as e:
        logger.error(f"Failed to parse planner JSON actions: {e}. Raw text: {response_text}")
        return []

@step(name="execute_document_tools")
async def execute_document_tools(actions: list, session_id: str, files_list: list) -> list:
    """Executes the conversion or compression tools and updates the file list."""
    logger.info(f"Step 2: Executing document tools for actions: {actions}")
    
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_dir = os.path.join(base_dir, "uploads", session_id)
    
    updated_files = list(files_list)
    
    for action in actions:
        filename = action.get("filename")
        act_type = action.get("action")
        
        # Find the file in our list
        matching_file = None
        for f in updated_files:
            if f.get("filename") == filename:
                matching_file = f
                break
                
        if not matching_file:
            continue
            
        file_path = os.path.join(uploads_dir, filename)
        
        try:
            if act_type == "compress":
                new_url = compress_document_tool(file_path, session_id)
                new_filename = os.path.basename(new_url)
                new_path = os.path.join(uploads_dir, new_filename)
                
                # Update files list details
                matching_file["filename"] = new_filename
                matching_file["filesize"] = os.path.getsize(new_path)
                logger.info(f"Successfully compressed file to {new_filename}")
                
            elif act_type == "convert":
                target_format = action.get("target_format", "pdf")
                new_url = convert_document_tool(file_path, target_format, session_id)
                new_filename = os.path.basename(new_url)
                new_path = os.path.join(uploads_dir, new_filename)
                
                # Update files list details
                matching_file["filename"] = new_filename
                matching_file["filesize"] = os.path.getsize(new_path)
                matching_file["filetype"] = target_format
                logger.info(f"Successfully converted file to {new_filename}")
                
        except Exception as tool_err:
            logger.error(f"Error executing tool {act_type} for {filename}: {tool_err}")
            
    return updated_files

@step(name="generate_extracted_response")
async def generate_extracted_response(remote_response: str, processed_files: list) -> str:
    """Generates the final formatted response utilizing OCR text mapped to form fields."""
    logger.info("Step 3: Formatting final response...")
    
    system_prompt = """You are Form Mitra, an intelligent local form filling assistant.
Your goal is to extract the values for the fields listed in the remote agent's response using the provided OCR texts from the uploaded documents.
Create a clean, list-based summary of the extracted fields, followed by the list of attachments.

Format MUST be exactly like this (do not output any introduction or conversational greetings):
1. [Field Name]: [Extracted Value]
2. [Field Name]: [Extracted Value]
...
**Attachments:**
[Filename 1], [Filename 2], ...

Rules:
- Use ONLY the field names requested in the remote agent's response.
- Extract values accurately from the OCR text of the files.
- List ONLY the final processed/uploaded attachments (e.g. compressed or converted files).
- Start directly with the first field."""

    # Build prompt content from files and their OCR texts
    ocr_descriptions = []
    attachments_list = []
    for f in processed_files:
        filename = f.get("filename")
        attachments_list.append(filename)
        ocr_text = f.get("extracted_text", "")
        ocr_descriptions.append(f"File: {filename}\nOCR Text:\n{ocr_text}\n---")
        
    prompt = f"Remote Agent Response (Required Fields & Uploads):\n{remote_response}\n\nOCR Texts:\n" + "\n".join(ocr_descriptions)
    
    try:
        stream = local_model_service.generate_stream(system_prompt, prompt)
        response_text = "".join(list(stream)).strip()
        
        # Ensure attachments part is included
        if "**Attachments:**" not in response_text:
            attachments_str = ", ".join(attachments_list)
            response_text += f"\n\n**Attachments:**\n{attachments_str}"
            
        return response_text
    except Exception as e:
        logger.error(f"Error generating final extracted response: {e}")
        return "Failed to process form extraction fields."

# ---------------------------------------------------------------------------
# Workflow Definition
# ---------------------------------------------------------------------------

@workflow(name="local_document_processing_workflow")
async def local_document_processing_workflow(input_data: dict) -> str:
    """Orchestrates document analysis, planning, conversion/compression tools execution, and final extraction."""
    remote_response = input_data.get("remote_response", "")
    files_list = input_data.get("files_list", [])
    session_id = input_data.get("session_id", "")
    
    # 1. Plan document actions (compression or conversion)
    actions = await plan_document_actions(remote_response, files_list)
    
    # 2. Execute tools on files
    processed_files = await execute_document_tools(actions, session_id, files_list)
    
    # 3. Generate final extracted fields response
    final_response = await generate_extracted_response(remote_response, processed_files)
    
    # Store processed files details in a temp file as required
    temp_fd, temp_file_path = tempfile.mkstemp(suffix=".json", prefix="ocr_extracted_")
    with os.fdopen(temp_fd, 'w') as temp_file:
        json.dump(processed_files, temp_file, indent=2)
    logger.info(f"Processed file details printed to temp file: {temp_file_path}")
    print(f"Processed file details printed to temp file: {temp_file_path}")
    
    return final_response
