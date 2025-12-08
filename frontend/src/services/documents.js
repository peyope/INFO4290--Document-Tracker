// frontend/src/services/documents.js
import api from "../api/axiosConfig";

/* ---------------------------------------------------------
   GET ALL DOCUMENTS
--------------------------------------------------------- */
export async function listDocuments() {
  const { data } = await api.get("/documents");
  return data || [];
}

/* ---------------------------------------------------------
   GET SINGLE DOCUMENT WITH FILES + AUDIT
--------------------------------------------------------- */
export async function getDocument(id) {
  const { data } = await api.get(`/documents/${id}`);

  return {
    document: data.document || data,
    files: data.files || [],
    audit: data.audit || [],
  };
}

/* ---------------------------------------------------------
   CREATE DOCUMENT
--------------------------------------------------------- */
export async function createDocument(payload) {
  const { data } = await api.post("/documents", payload);

  return {
    document: data.document || data,
    files: data.files || [],
    audit: data.audit || [],
  };
}

/* ---------------------------------------------------------
   UPDATE DOCUMENT
--------------------------------------------------------- */
export async function updateDocument(id, payload) {
  const cleanPayload = {
    title: payload.title ?? null,
    location: payload.location ?? null,
    site: payload.site ?? null,
    status: payload.status ?? null,
    description: payload.description ?? null,
    retention_date: payload.retention_date ?? null,
    file_closed_date: payload.file_closed_date ?? null,
    owner_id: payload.owner_id ?? null,
    holder_id: payload.holder_id ?? null,
  };

  const { data } = await api.put(`/documents/${id}`, cleanPayload);

  return {
    document: data.document,
    files: data.files || [],
    audit: data.audit || [],
  };
}

/* ---------------------------------------------------------
   DELETE DOCUMENT
--------------------------------------------------------- */
export async function deleteDocument(id) {
  await api.delete(`/documents/${id}`);
}

/* ---------------------------------------------------------
   UPLOAD FILE
--------------------------------------------------------- */
export async function uploadDocumentFile(id, file) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post(`/documents/${id}/files`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return data;
}

/* ---------------------------------------------------------
   DELETE FILE
--------------------------------------------------------- */
export async function deleteDocumentFile(docId, fileId) {
  await api.delete(`/documents/${docId}/files/${fileId}`);
}
