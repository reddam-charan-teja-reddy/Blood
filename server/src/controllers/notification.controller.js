import { Notification } from '../models/Notification.js';

/**
 * GET /api/v1/notifications
 * Returns all notifications for the current user, newest first.
 * Supports ?unreadOnly=true to filter.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const { unreadOnly } = req.query;
    const filter = { userId: req.user.id };
    if (unreadOnly === 'true') filter.isRead = false;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      isRead: false,
    });

    res.json({ notifications, unreadCount });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read.
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOne({
      _id: id,
      userId: req.user.id, // can only mark own notifications
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notification.isRead = true;
    await notification.save();

    res.json({ success: true, notification });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Marks ALL unread notifications for the current user as read.
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} notification(s) marked as read`,
    });
  } catch (error) {
    next(error);
  }
};
