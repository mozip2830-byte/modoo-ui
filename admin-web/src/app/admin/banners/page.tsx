"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import {
  createHomeBanner,
  deleteHomeBanner,
  getHomeBanners,
  updateHomeBanner,
  HomeBanner,
} from "@/lib/firestore";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes } from "firebase/storage";
import { Timestamp } from "firebase/firestore";

type BannerForm = {
  title: string;
  imageUrl: string;
  type: "partner" | "external";
  target: "customer" | "partner" | "all";
  partnerId: string;
  url: string;
  active: string;
  priority: string;
  startsAt: string;
  endsAt: string;
};

const emptyForm: BannerForm = {
  title: "",
  imageUrl: "",
  type: "partner",
  target: "all",
  partnerId: "",
  url: "",
  active: "true",
  priority: "0",
  startsAt: "",
  endsAt: "",
};

function toDateInputValue(value?: { toDate?: () => Date } | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : value.toDate?.();
  if (!date) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDateInput(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
}

export default function AdminBannersPage() {
  const router = useRouter();
  const { user, loading, isAdmin } = useAuth();

  const [banners, setBanners] = useState<HomeBanner[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HomeBanner | null>(null);
  const [formValues, setFormValues] = useState<BannerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user && isAdmin) {
      loadBanners();
    }
  }, [user, isAdmin]);

  const loadBanners = async () => {
    setLoadingData(true);
    setError("");
    try {
      const result = await getHomeBanners();
      setBanners(result);
    } catch (err) {
      console.error(err);
      setError("배너 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingData(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="loading">로딩 중...</div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="admin-container">
        <div className="card">
          <h1 className="title">권한 없음</h1>
          <p>관리자 권한이 필요합니다.</p>
          <Link href="/admin" className="link mt-16">
            ← 관리 홈으로
          </Link>
        </div>
      </div>
    );
  }

  const openCreate = () => {
    setEditingBanner(null);
    setFormValues(emptyForm);
    setIsModalOpen(true);
    setUploadError("");
  };

  const openEdit = (banner: HomeBanner) => {
    setEditingBanner(banner);
    setFormValues({
      title: banner.title ?? "",
      imageUrl: banner.imageUrl ?? "",
      type: banner.type ?? "partner",
      target: banner.target ?? "all",
      partnerId: banner.partnerId ?? "",
      url: banner.url ?? "",
      active: banner.active === false ? "false" : "true",
      priority: String(banner.priority ?? 0),
      startsAt: toDateInputValue(banner.startsAt as any),
      endsAt: toDateInputValue(banner.endsAt as any),
    });
    setIsModalOpen(true);
    setUploadError("");
  };

  const closeModal = () => {
    setEditingBanner(null);
    setFormValues(emptyForm);
    setIsModalOpen(false);
    setUploadError("");
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");

    const payload = {
      title: formValues.title.trim(),
      imageUrl: formValues.imageUrl.trim(),
      type: formValues.type,
      target: formValues.target,
      partnerId: formValues.type === "partner" ? formValues.partnerId.trim() : null,
      url: formValues.type === "external" ? formValues.url.trim() : null,
      active: formValues.active === "true",
      priority: parseInt(formValues.priority, 10) || 0,
      startsAt: parseDateInput(formValues.startsAt),
      endsAt: parseDateInput(formValues.endsAt),
    };

    try {
      if (editingBanner) {
        await updateHomeBanner(editingBanner.id, payload, user.uid, user.email || "");
      } else {
        await createHomeBanner(payload as any, user.uid, user.email || "");
      }
      await loadBanners();
      closeModal();
    } catch (err) {
      console.error(err);
      setError("배너 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadImage = async (file: File | null) => {
    if (!file || !user) return;
    if (!editingBanner) {
      setUploadError("배너 저장 후 업로드할 수 있습니다.");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const safeName = file.name.replace(/\s+/g, "_");
      const path = `homeBanners/${editingBanner.id}/${Date.now()}-${safeName}`;
      await uploadBytes(ref(storage, path), file);
      await updateHomeBanner(
        editingBanner.id,
        { imageUrl: path },
        user.uid,
        user.email || ""
      );
      await loadBanners();
      setFormValues((prev) => ({ ...prev, imageUrl: path }));
    } catch (err) {
      console.error(err);
      setUploadError("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBanner || !user) return;
    if (!confirm("이 배너를 삭제할까요?")) return;
    setSaving(true);
    setError("");
    try {
      await deleteHomeBanner(editingBanner.id, user.uid, user.email || "");
      await loadBanners();
      closeModal();
    } catch (err) {
      console.error(err);
      setError("배너 삭제 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">홈 배너</h1>
        <div className="gap-8">
          <button className="btn btn-primary" onClick={openCreate}>
            새 배너
          </button>
          <Link href="/admin" className="link">
            ← 관리 홈
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loadingData ? (
        <div className="loading">불러오는 중...</div>
      ) : banners.length === 0 ? (
        <div className="card">
          <p>등록된 배너가 없습니다.</p>
        </div>
      ) : (
        <div className="card">
          <div className="user-list">
            {banners.map((banner) => (
              <div key={banner.id} className="user-item user-item-partner">
                <div className="user-info">
                  <div className="user-email">{banner.title}</div>
                  <div className="user-uid">{banner.id}</div>
                  <div className="user-biz">
                    {banner.type === "partner"
                      ? `파트너: ${banner.partnerId || "-"}`
                      : `링크: ${banner.url || "-"}`}
                  </div>
                  <div className="user-biz">
                    대상: {banner.target === "all" ? "고객+파트너" : banner.target}
                  </div>
                </div>
                <div className="user-meta">
                  <span className={`badge ${banner.active ? "badge-success" : "badge-warning"}`}>
                    {banner.active ? "활성" : "비활성"}
                  </span>
                  <span className="badge badge-info">우선순위: {banner.priority ?? 0}</span>
                </div>
                <button className="btn-edit" onClick={() => openEdit(banner)}>
                  수정
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{editingBanner ? "배너 수정" : "배너 추가"}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="label">제목</label>
                <input
                  className="input"
                  value={formValues.title}
                  onChange={(e) => setFormValues({ ...formValues, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">이미지 URL</label>
                <input
                  className="input"
                  value={formValues.imageUrl}
                  onChange={(e) => setFormValues({ ...formValues, imageUrl: e.target.value })}
                  placeholder="https://... 또는 gs://..."
                />
                <div className="mt-16">
                  <label className="label">이미지 업로드</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleUploadImage(e.target.files?.[0] || null)}
                    disabled={uploading || !editingBanner}
                  />
                  {!editingBanner && (
                    <p className="subtitle">배너를 먼저 저장한 뒤 업로드하세요.</p>
                  )}
                  {uploadError && <p className="error">{uploadError}</p>}
                </div>
              </div>
              <div className="form-group">
                <label className="label">유형</label>
                <select
                  className="input"
                  value={formValues.type}
                  onChange={(e) =>
                    setFormValues({ ...formValues, type: e.target.value as "partner" | "external" })
                  }
                >
                  <option value="partner">파트너 상세</option>
                  <option value="external">외부 링크</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">노출 대상</label>
                <select
                  className="input"
                  value={formValues.target}
                  onChange={(e) =>
                    setFormValues({
                      ...formValues,
                      target: e.target.value as "customer" | "partner" | "all",
                    })
                  }
                >
                  <option value="all">고객 + 파트너</option>
                  <option value="customer">고객 앱</option>
                  <option value="partner">파트너 앱</option>
                </select>
              </div>
              {formValues.type === "partner" ? (
                <div className="form-group">
                  <label className="label">파트너 UID</label>
                  <input
                    className="input"
                    value={formValues.partnerId}
                    onChange={(e) =>
                      setFormValues({ ...formValues, partnerId: e.target.value })
                    }
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label className="label">외부 링크</label>
                  <input
                    className="input"
                    value={formValues.url}
                    onChange={(e) => setFormValues({ ...formValues, url: e.target.value })}
                  />
                </div>
              )}
              <div className="form-group">
                <label className="label">우선순위</label>
                <input
                  type="number"
                  className="input"
                  value={formValues.priority}
                  onChange={(e) => setFormValues({ ...formValues, priority: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="label">활성</label>
                <select
                  className="input"
                  value={formValues.active}
                  onChange={(e) => setFormValues({ ...formValues, active: e.target.value })}
                >
                  <option value="true">활성</option>
                  <option value="false">비활성</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">시작</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={formValues.startsAt}
                  onChange={(e) => setFormValues({ ...formValues, startsAt: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="label">종료</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={formValues.endsAt}
                  onChange={(e) => setFormValues({ ...formValues, endsAt: e.target.value })}
                />
              </div>

              {error && <p className="error">{error}</p>}

              <div className="modal-actions">
                {editingBanner && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    삭제
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  disabled={saving}
                >
                  취소
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
