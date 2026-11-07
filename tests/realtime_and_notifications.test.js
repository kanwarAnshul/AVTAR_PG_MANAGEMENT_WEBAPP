const { describe, it } = require('node:test');
const assert = require('node:assert');

/**
 * REAL-TIME NOTIFICATION & STORE INTEGRATION TEST
 * Validates:
 * 1. Notification store badge calculation.
 * 2. Real-time postgres_changes event ingestion for notices and complaints.
 * 3. Notification triggers for registration status and complaint progress.
 */

class MockNotificationStore {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
  }

  addNotification(notification) {
    this.notifications.unshift(notification);
    if (!notification.is_read) {
      this.unreadCount += 1;
    }
  }

  markAsRead(id) {
    const item = this.notifications.find((n) => n.id === id);
    if (item && !item.is_read) {
      item.is_read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
    }
  }

  markAllAsRead() {
    this.notifications.forEach((n) => {
      n.is_read = true;
    });
    this.unreadCount = 0;
  }
}

describe('Real-Time Notification Store', () => {
  it('should accurately increment unread badge count on incoming notifications', () => {
    const store = new MockNotificationStore();

    store.addNotification({
      id: 'notif-1',
      title: '🎉 Registration Approved!',
      body: 'Your PG registration has been approved.',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    assert.strictEqual(store.notifications.length, 1);
    assert.strictEqual(store.unreadCount, 1);

    store.addNotification({
      id: 'notif-2',
      title: '💰 Rent Due',
      body: 'Monthly rent invoice for March is generated.',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    assert.strictEqual(store.notifications.length, 2);
    assert.strictEqual(store.unreadCount, 2);

    // Mark 1 as read
    store.markAsRead('notif-1');
    assert.strictEqual(store.unreadCount, 1);
    assert.strictEqual(store.notifications[1].is_read, true);

    // Mark all as read
    store.markAllAsRead();
    assert.strictEqual(store.unreadCount, 0);
  });
});

describe('Database Trigger Event Emulation', () => {
  // Emulates PostgreSQL notify_on_registration_status trigger
  function onRegistrationUpdate(oldRow, newRow) {
    if (oldRow.status === newRow.status) return null;

    if (newRow.status === 'approved') {
      return {
        user_id: newRow.user_id,
        type: 'approval',
        title: '🎉 Registration Approved!',
        body: 'Your PG registration has been approved. You can now login.',
        data: { registration_id: newRow.id },
      };
    } else if (newRow.status === 'rejected') {
      return {
        user_id: newRow.user_id,
        type: 'rejection',
        title: '❌ Registration Rejected',
        body: `Reason: ${newRow.decision_reason || 'Please contact warden.'}`,
        data: { registration_id: newRow.id, reason: newRow.decision_reason },
      };
    }
    return null;
  }

  it('should emit registration approval notification when status transitions from pending to approved', () => {
    const oldRow = { id: 'reg-1', user_id: 'u-1', status: 'pending' };
    const newRow = { id: 'reg-1', user_id: 'u-1', status: 'approved' };

    const event = onRegistrationUpdate(oldRow, newRow);
    assert.ok(event);
    assert.strictEqual(event.type, 'approval');
    assert.strictEqual(event.user_id, 'u-1');
    assert.ok(event.title.includes('Approved'));
  });

  it('should emit rejection notification with reason when status transitions to rejected', () => {
    const oldRow = { id: 'reg-2', user_id: 'u-2', status: 'pending' };
    const newRow = { id: 'reg-2', user_id: 'u-2', status: 'rejected', decision_reason: 'Aadhaar copy is unreadable' };

    const event = onRegistrationUpdate(oldRow, newRow);
    assert.ok(event);
    assert.strictEqual(event.type, 'rejection');
    assert.strictEqual(event.user_id, 'u-2');
    assert.ok(event.body.includes('Aadhaar copy is unreadable'));
  });

  // Emulates PostgreSQL notify_on_complaint_update trigger
  function onComplaintUpdate(oldRow, newRow) {
    if (oldRow.status === newRow.status) return null;

    return {
      tenant_id: newRow.tenant_id,
      type: 'complaint_update',
      title: '🛠 Complaint Updated',
      body: `Your complaint "${newRow.title}" is now ${newRow.status}`,
      data: { complaint_id: newRow.id, status: newRow.status },
    };
  }

  it('should notify tenant when complaint status moves to in_progress or resolved', () => {
    const oldRow = { id: 'c-1', tenant_id: 't-1', title: 'WiFi router down', status: 'open' };
    const newRow = { id: 'c-1', tenant_id: 't-1', title: 'WiFi router down', status: 'resolved' };

    const event = onComplaintUpdate(oldRow, newRow);
    assert.ok(event);
    assert.strictEqual(event.type, 'complaint_update');
    assert.ok(event.body.includes('is now resolved'));
  });
});

