// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { RecordDisclosure } from '../src/components/RecordDisclosure.js';
it('opens a record on demand and preserves unfinished local input after collapse', () => {
  function Editor() {
    const [value, setValue] = useState('');
    return (
      <input
        aria-label="Unfinished numeric text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  }
  const view = render(
    <RecordDisclosure id="record-one" title="Receiving" reveal={false}>
      <Editor />
    </RecordDisclosure>,
  );
  expect(screen.queryByLabelText('Unfinished numeric text')).toBeNull();
  const details = view.container.querySelector('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  fireEvent.change(screen.getByLabelText('Unfinished numeric text'), { target: { value: '1.' } });
  details.open = false;
  fireEvent(details, new Event('toggle'));
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect((screen.getByLabelText('Unfinished numeric text') as HTMLInputElement).value).toBe('1.');
  cleanup();
});
