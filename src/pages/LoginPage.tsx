import { Button, Card, Space } from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useLoading } from "@/hooks/useLoading";
import { useEffect } from "react";

export default function LoginPage() {
  const { loginWithGoogle, loading, user } = useAuth();
  const navigate = useNavigate();
  const { showLoading, closeLoading } = useLoading();

  useEffect(() => {
    // Show loading overlay while checking initial auth state
    if (loading) {
      showLoading("auth-init");
    } else {
      closeLoading("auth-init");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    // Only redirect if user is authenticated and auth check is done (loading = false)
    if (user && !loading) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0e27",
      }}
    >
      <Card style={{ width: 420, textAlign: "center" }}>
        <h2>Đăng nhập</h2>
        <p>
          Vui lòng đăng nhập bằng <strong>Google</strong> đã đăng kí để truy cập
        </p>
        <Space orientation="vertical" style={{ width: "100%" }}>
          <Button
            icon={<GoogleOutlined />}
            type="primary"
            block
            loading={loading}
            onClick={loginWithGoogle}
          >
            Đăng nhập bằng Google
          </Button>
        </Space>
      </Card>
    </div>
  );
}
