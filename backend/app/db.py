import sqlite3
import os
import logging

logger = logging.getLogger("app.db")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "form_mitra.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    logger.info(f"Initializing database at: {DB_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT,
            timestamp TEXT NOT NULL,
            progress_events TEXT,
            citation_map TEXT,
            annotations TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Migrate existing databases to add columns if not present
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN citation_map TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists

    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN annotations TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    # Create attachments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            name TEXT NOT NULL,
            size INTEGER,
            data_url TEXT,
            extracted_text TEXT,
            FOREIGN KEY (message_id) REFERENCES messages (id) ON DELETE CASCADE
        )
    """)
    
    try:
        cursor.execute("ALTER TABLE attachments ADD COLUMN extracted_text TEXT")
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    conn.commit()
    conn.close()

def create_session(session_id: str, title: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO sessions (id, title) VALUES (?, ?)", (session_id, title))
        conn.commit()
    finally:
        conn.close()

def save_message(message_id: str, session_id: str, role: str, content: str | None, timestamp: str, progress_events: str | None = None, citation_map: str | None = None, annotations: str | None = None):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO messages (id, session_id, role, content, timestamp, progress_events, citation_map, annotations) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (message_id, session_id, role, content, timestamp, progress_events, citation_map, annotations)
        )
        conn.commit()
    finally:
        conn.close()

def save_attachment(message_id: str, name: str, size: int | None, data_url: str | None, extracted_text: str | None = None):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO attachments (message_id, name, size, data_url, extracted_text) VALUES (?, ?, ?, ?, ?)",
            (message_id, name, size, data_url, extracted_text)
        )
        conn.commit()
    finally:
        conn.close()


def get_sessions():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC")
        sessions = [dict(row) for row in cursor.fetchall()]
        return sessions
    finally:
        conn.close()

def get_session_messages(session_id: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, role, content, timestamp, progress_events, citation_map, annotations FROM messages WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
        messages = [dict(row) for row in cursor.fetchall()]
        
        for msg in messages:
            cursor.execute("SELECT name, size, data_url, extracted_text FROM attachments WHERE message_id = ?", (msg["id"],))
            attachments = [dict(row) for row in cursor.fetchall()]
            msg["attachments"] = attachments
        return messages
    finally:
        conn.close()

def delete_session(session_id: str):
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        conn.commit()
    finally:
        conn.close()
