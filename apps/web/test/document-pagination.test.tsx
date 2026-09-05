// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DocumentView } from '../src/components/DocumentView.js';
it('bounds large review sections on screen while printing every original record', () => {
  const view = render(
    <DocumentView
      document={{
        title: 'Large review',
        sourceRevision: 'r1',
        sections: [
          {
            id: 'people',
            title: 'People',
            records: Array.from({ length: 101 }, (_, i) => ({
              id: `person-${i}`,
              title: `Person ${i}`,
              fields: [{ label: 'Role', value: 'Fictional participant' }],
            })),
          },
        ],
      }}
    />,
  );
  expect(view.container.querySelectorAll('.document-record')).toHaveLength(50);
  fireEvent.click(screen.getByText('Next page'));
  expect(screen.getByText('Person 50')).toBeTruthy();
  fireEvent(window, new Event('beforeprint'));
  expect(view.container.querySelectorAll('.document-record')).toHaveLength(101);
  fireEvent(window, new Event('afterprint'));
  expect(view.container.querySelectorAll('.document-record')).toHaveLength(50);
  expect(screen.getByText('Person 50')).toBeTruthy();
  cleanup();
});
