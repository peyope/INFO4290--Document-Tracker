// frontend/src/services/documents.js
import api from "../api/axiosConfig";

/* ------------ core documents ------------ */

export async function listDocuments(params = {}) {
  const { q, site, status } = params;
  const { data } = await api.get("/documents", {
    params: { q, site, status },
  });
  return data;
}

export async function getDocument(id) {
  const { data } = await api.get(`/documents/${id}`);
  return data;
}

export async function createDocument(payload) {
  const { data } = await api.post("/documents", payload);
  return data;
}

export async function updateDocument(id, payload) {
  const { data } = await api.put(`/documents/${id}`, payload);
  return data;
}

/* ------------ digital files ------------ */

export async function listDocumentFiles(documentId) {
  const { data } = await api.get(`/documents/${documentId}/files`);
  return data;
}

export async function uploadDocumentFile(documentId, file) {
  const formData = new FormData();
  formData.append("file", file);

  const { data } = await api.post(
    `/documents/${documentId}/files`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return data;
}

/**
 * Delete a digital file.
 *
 * Backend route:
 *   DELETE /api/documents/files/:fileId
 */
export async function deleteDocumentFile(documentId, fileId) {
  await api.delete(`/documents/files/${fileId}`);
}

/**
 * Build a download URL.
 *
 * Backend route:
 *   GET /api/documents/files/:fileId
 */
export function getDocumentFileUrl(documentId, fileId) {
  const base = api.defaults.baseURL || "";
  const token = localStorage.getItem("token");

  const url = `${base}/documents/files/${fileId}`;

  if (token) {
    const encoded = encodeURIComponent(token);
    return `${url}?token=${encoded}`;
  }

  return url;
}
