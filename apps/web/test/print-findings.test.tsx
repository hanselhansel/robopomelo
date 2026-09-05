// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { PagedList } from '../src/components/ui.js';
it('prints findings beyond the current page and search without losing the screen filter', () => {
  render(
    <PagedList
      printAll
      items={Array.from({ length: 80 }, (_, i) => `Finding ${i}`)}
      label="findings"
      searchText={(value) => value}
    >
      {(value) => <p key={value}>{value}</p>}
    </PagedList>,
  );
  fireEvent.change(screen.getByLabelText('Search findings'), { target: { value: 'Finding 1' } });
  expect(screen.queryByText('Finding 79')).toBeNull();
  fireEvent(window, new Event('beforeprint'));
  expect(screen.getByText('Finding 79')).toBeTruthy();
  fireEvent(window, new Event('afterprint'));
  expect(screen.queryByText('Finding 79')).toBeNull();
  expect((screen.getByLabelText('Search findings') as HTMLInputElement).value).toBe('Finding 1');
  cleanup();
});
