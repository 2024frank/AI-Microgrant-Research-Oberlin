import { getRejectionHistory } from '@/lib/rejectionHistory';

// Pull the mock from setup
const db = require('@/lib/db');

beforeEach(() => jest.clearAllMocks());

describe('getRejectionHistory', () => {
  it('returns empty result when no rejections exist', async () => {
    db.default.query.mockResolvedValueOnce([[]]); // empty rows
    const result = await getRejectionHistory(1, 50);
    expect(result.count).toBe(0);
    expect(result.prompt_block).toBe('');
  });

  it('builds a prompt block with rejection examples', async () => {
    db.default.query.mockResolvedValueOnce([[
      {
        event_title:   'Faculty Meeting',
        reason_codes:  JSON.stringify(['wrong_audience']),
        reviewer_note: 'Staff only event',
        created_at:    new Date(),
      },
      {
        event_title:   'Jazz Night',
        reason_codes:  JSON.stringify(['description_hallucinated', 'bad_date_parse']),
        reviewer_note: '',
        created_at:    new Date(),
      },
    ]]);

    const result = await getRejectionHistory(1, 50);

    expect(result.count).toBe(2);
    expect(result.prompt_block).toContain('Faculty Meeting');
    expect(result.prompt_block).toContain('wrong_audience');
    expect(result.prompt_block).toContain('Jazz Night');
    expect(result.prompt_block).toContain('description_hallucinated');
    expect(result.prompt_block).toContain('Reason codes');
  });

  it('limits prompt block to 20 examples even if more are fetched', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      event_title:   `Event ${i}`,
      reason_codes:  JSON.stringify(['other']),
      reviewer_note: '',
      created_at:    new Date(),
    }));
    db.default.query.mockResolvedValueOnce([rows]);

    const result = await getRejectionHistory(1, 50);
    // Only first 20 should appear in prompt block
    expect(result.prompt_block).toContain('Event 0');
    expect(result.prompt_block).toContain('Event 19');
    expect(result.prompt_block).not.toContain('Event 20');
  });

  it('includes reviewer note when present', async () => {
    db.default.query.mockResolvedValueOnce([[{
      event_title:   'Test Event',
      reason_codes:  JSON.stringify(['bad_location']),
      reviewer_note: 'Address was completely wrong',
      created_at:    new Date(),
    }]]);

    const result = await getRejectionHistory(1, 50);
    expect(result.prompt_block).toContain('Address was completely wrong');
  });

  it('queries with correct source_id and limit', async () => {
    db.default.query.mockResolvedValueOnce([[]]);
    await getRejectionHistory(42, 25);
    expect(db.default.query).toHaveBeenCalledWith(
      expect.stringContaining('source_id = ?'),
      [42, 25]
    );
  });
});
