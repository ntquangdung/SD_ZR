# Global Loading Hook

## Cách sử dụng

### 1. Import hook

```tsx
import { useLoading } from "@/contexts/LoadingContext";
```

### 2. Sử dụng trong component

```tsx
function MyComponent() {
  const { showLoading, closeLoading, isLoading } = useLoading();

  const handleSubmit = async () => {
    // Bật loading với key "submit-form"
    showLoading("submit-form");

    try {
      await apiCall();
    } finally {
      // Tắt loading
      closeLoading("submit-form");
    }
  };

  // Kiểm tra loading state
  const submitting = isLoading("submit-form");

  return (
    <button onClick={handleSubmit} disabled={submitting}>
      {submitting ? "Submitting..." : "Submit"}
    </button>
  );
}
```

### 3. Nhiều loading states khác nhau

```tsx
function Dashboard() {
  const { showLoading, closeLoading, isLoading } = useLoading();

  const loadUsers = async () => {
    showLoading("users");
    await fetchUsers();
    closeLoading("users");
  };

  const loadPosts = async () => {
    showLoading("posts");
    await fetchPosts();
    closeLoading("posts");
  };

  return (
    <div>
      <button onClick={loadUsers} disabled={isLoading("users")}>
        Load Users
      </button>
      <button onClick={loadPosts} disabled={isLoading("posts")}>
        Load Posts
      </button>
    </div>
  );
}
```

## API

- `showLoading(key: string)` - Bật loading với key
- `closeLoading(key: string)` - Tắt loading với key
- `isLoading(key: string)` - Kiểm tra loading state của key
- `isAnyLoading()` - Kiểm tra có bất kỳ loading nào đang chạy

## Lợi ích

✅ Không cần truyền props loading xuống nhiều components
✅ Quản lý nhiều loading states độc lập
✅ Global overlay loading tự động hiển thị
✅ Clean code, dễ maintain
