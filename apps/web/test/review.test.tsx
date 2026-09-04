// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DocumentView } from '../src/components/DocumentView.js';
afterEach(cleanup);
it('renders canonical document text without executing markup and retains unknown values', () => {
  render(
    <DocumentView
      document={{
        title: 'Inbound plan',
        sourceRevision: 'r42',
        sections: [
          {
            id: 'scope',
            title: 'Scope',
            records: [
              {
                id: 'n1',
                title: 'Receiving',
                fields: [
                  { label: 'Outcome', value: '<img src="https://evil.example/x" onerror="alert(1)">' },
                  { label: 'Baseline', value: 'Unknown: measurement needed' },
                ],
              },
            ],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText('Unknown: measurement needed')).toBeTruthy();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText(/r42/)).toBeTruthy();
});
