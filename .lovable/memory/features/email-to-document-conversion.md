# Email-to-Document Conversion Feature

## Current Behavior (Unified Model)

Emails can be **marked** as documents without duplicating any files. When an email is marked as a document:

1. **No file duplication**: The email and its attachments remain in `email_messages` and `email-attachments` storage
2. **Database flag**: A boolean `is_document` field and optional `document_type` are set on the email record
3. **Unified display**: The `BudgetDocumentsTab` fetches both:
   - Regular documents from `project_documents`
   - Emails with `is_document = true` from `email_messages`
4. **Attachments referenced**: Email attachments are accessible directly from the email-attachments bucket

## UI/UX

- **"Documento" button**: Available next to "Asociar/Tarea" in both CRM Communications and Budget Communications
- **Visual indicator**: Email-documents show a "Email" badge and Mail icon in the documents list
- **Attachment count**: Shows number of attachments as a badge with paperclip icon
- **Preview**: Opens a dialog showing the email body with downloadable attachments
- **Unmark action**: Admins can remove the document flag (X button) without deleting the email

## Database Schema

```sql
-- Added to email_messages table:
is_document boolean DEFAULT false
document_type text

-- Index for performance:
CREATE INDEX idx_email_messages_is_document ON email_messages(is_document) WHERE is_document = true;
```

## Components

- `CreateDocumentFromEmailDialog`: Simplified to just mark email as document (no file operations)
- `BudgetDocumentsTab`: Extended to fetch and display both regular docs and email-docs using `UnifiedDocument` type
- `UnifiedCommunicationsList`: Includes "Documento" button for emails in CRM
- `BudgetEmailInbox`: Includes "Documento" button for emails in budget communications
