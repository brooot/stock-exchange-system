'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Form, Input, Button, Tabs, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useToast } from '../../hooks/useToast';
import { useLogin, useRegister } from '../../hooks/useApiQueries';

const { Title, Text } = Typography;

interface LoginForm {
  username: string;
  password: string;
}

interface RegisterForm {
  username: string;
  password: string;
  confirmPassword: string;
}

// 公共输入框配置
const inputConfig = {
  size: 'large' as const,
  style: { backgroundColor: 'transparent' },
};

// 公共表单配置
const formConfig = {
  autoComplete: 'off',
  layout: 'vertical' as const,
};

export default function AuthPage() {
  const [error, setError] = useState('');
  const [activeKey, setActiveKey] = useState('login');
  const router = useRouter();
  const { showSuccess } = useToast();
  const [loginForm] = Form.useForm<LoginForm>();
  const [registerForm] = Form.useForm<RegisterForm>();

  // 使用 TanStack Query mutations
  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const loading = loginMutation.isPending || registerMutation.isPending;

  const handleLogin = async (values: LoginForm) => {
    setError('');
    loginMutation.mutate(values, {
      onSuccess: (response) => {
        // token现在存储在httpOnly cookie中，不需要手动存储
        localStorage.setItem('username', response.data.username);
        showSuccess('登录成功！');
        router.push('/dashboard');
      },
      onError: (err: any) => {
        const errorMessage = err.response?.data?.message || '登录失败';
        setError(errorMessage);
      }
    });
  };

  const handleRegister = async (values: RegisterForm) => {
    setError('');

    registerMutation.mutate({
      username: values.username,
      password: values.password,
    }, {
      onSuccess: () => {
        showSuccess('注册成功！请登录');
        registerForm.resetFields();
        // 注册成功后，切换到登录tab
        setActiveKey('login');
      },
      onError: (err: any) => {
        const errorMessage = err.response?.data?.message || '注册失败';
        setError(errorMessage);
      }
    });
  };

  const tabItems = [
    {
      key: 'login',
      label: '登录',
      children: (
        <Form
          form={loginForm}
          name="login"
          onFinish={handleLogin}
          {...formConfig}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              {...inputConfig}
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              {...inputConfig}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'register',
      label: '注册',
      children: (
        <Form
          form={registerForm}
          name="register"
          onFinish={handleRegister}
          {...formConfig}
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              {...inputConfig}
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码!' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              {...inputConfig}
            />
          </Form.Item>

          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码!' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致!'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请确认密码"
              {...inputConfig}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              size="large"
              block
            >
              {loading ? '注册中...' : '注册'}
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card
        className="w-full max-w-md"
        style={{ boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)' }}
      >
        <div className="text-center mb-6">
          <Title level={2} style={{ marginBottom: 8 }}>
            股票交易系统
          </Title>
          <Text type="secondary">欢迎使用专业交易平台</Text>
        </div>

        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setError('')}
          />
        )}

        <Tabs
          activeKey={activeKey}
          items={tabItems}
          centered
          onChange={(key) => {
            setActiveKey(key);
            setError('');
          }}
        />
      </Card>
    </div>
  );
}
