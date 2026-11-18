import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LoginPage } from './LoginPage';
import { useSession } from './session';
import { ApiError } from '@/lib/api/client';

function renderLogin() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

describe('LoginPage', () => {
  beforeEach(() => {
    useSession.setState({ status: 'signedOut', user: null, notice: null });
  });

  it('validates before calling the server', async () => {
    const signIn = vi.fn();
    useSession.setState({ signIn });
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your organisation code')).toBeInTheDocument();
    expect(screen.getByText('Enter the email address you sign in with')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('signs in with an upper-cased organisation code', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined);
    useSession.setState({ signIn });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Organisation code'), 'mc');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith('MC', 'admin@example.com', 'secret-password');
  });

  it('explains a refused sign-in without revealing which part was wrong', async () => {
    useSession.setState({ signIn: vi.fn().mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'Invalid organisation, email or password')) });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Organisation code'), 'MC');
    await userEvent.type(screen.getByLabelText('Email'), 'admin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match an active account');
  });

  it('shows why the user was signed out', () => {
    useSession.setState({ notice: 'Your session ended. Sign in again to continue.' });
    renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended');
  });
});
