import { describe, expect, it } from 'vitest';
import { LineBuffer } from './transport';

/**
 * Line assembly is where a serial bug is easiest to introduce and hardest to
 * see: the symptom is a response that occasionally goes missing.
 */
describe('LineBuffer', () => {
  it('emits complete lines and holds the remainder', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('ok\nerror:1\npart')).toEqual(['ok', 'error:1']);
    expect(buffer.push('ial\n')).toEqual(['partial']);
  });

  it('reassembles a line split across chunks', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('<Idle|MPos:0.0')).toEqual([]);
    expect(buffer.push('00,0.000,0.000>')).toEqual([]);
    expect(buffer.push('\n')).toEqual(['<Idle|MPos:0.000,0.000,0.000>']);
  });

  it('normalises CRLF, LF, and lone CR', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('a\r\nb\nc\rd\n')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not split a CRLF pair that spans two chunks', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('ok\r')).toEqual([]);
    expect(buffer.push('\nnext\n')).toEqual(['ok', 'next']);
  });

  it('drops empty lines produced by consecutive terminators', () => {
    const buffer = new LineBuffer();
    expect(buffer.push('\r\n\r\nok\r\n')).toEqual(['ok']);
  });

  it('flushes an unterminated remainder', () => {
    const buffer = new LineBuffer();
    buffer.push('trailing');
    expect(buffer.flush()).toEqual(['trailing']);
    expect(buffer.flush()).toEqual([]);
  });

  it('releases the buffer when a device streams without terminators', () => {
    const buffer = new LineBuffer();
    const emitted = buffer.push('x'.repeat(LineBuffer.MAX_PENDING + 10));
    expect(emitted).toHaveLength(1);
    expect(buffer.flush()).toEqual([]);
  });
});
