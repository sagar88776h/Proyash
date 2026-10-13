import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormErrorSummary } from './FormErrorSummary';

const errors = [
  { field: 'category', message: 'Choose the type of help needed.' },
  { field: 'phone', message: 'Enter a valid phone number.' },
];

describe('FormErrorSummary', () => {
  it('stays hidden until the first submit attempt', () => {
    render(<FormErrorSummary errors={errors} attempt={0} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('takes focus when errors arrive after the attempt counter changes', () => {
    const { rerender } = render(<FormErrorSummary errors={[]} attempt={1} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<FormErrorSummary errors={errors} attempt={1} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Enter a valid phone number.' })).toHaveAttribute('href', '#f-phone');
  });

  it('does not steal focus again until the next attempt', () => {
    const { rerender } = render(<FormErrorSummary errors={errors} attempt={1} />);
    screen.getByRole('alert').blur();
    rerender(<FormErrorSummary errors={errors.slice(1)} attempt={1} />);
    expect(screen.getByRole('alert')).not.toHaveFocus();
    rerender(<FormErrorSummary errors={errors.slice(1)} attempt={2} />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
