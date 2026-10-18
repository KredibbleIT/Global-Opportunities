import './instrument.js';
import { app } from './app.js';
import { env } from './config/env.js';
import { connectToDatabase } from './lib/mongodb.js';
import logger from './lib/logger.js';
import { completePendingDeletions } from './lib/account-deletion.js';
import { deliverDueNotifications } from './lib/notification-scheduler.js';
import { checkPushReceipts } from './lib/push.js';

import http from 'http';
import { initSocket } from './socket.js';

const DELETION_RECOVERY_INTERVAL_MS = 60 * 60 * 1000;
const SCHEDULED_NOTIFICATION_INTERVAL_MS = 60 * 1000;
const PUSH_RECEIPT_INTERVAL_MS = 15 * 60 * 1000;

/** SEC-065: finish account deletions that stopped part-way. Never rejects. */
const runDeletionRecovery = async () => {
  try {
    const { processed, failed } = await completePendingDeletions();
    if (failed > 0) {
      logger.error({ processed, failed }, 'Some account deletions are still unfinished');
    } else if (processed > 0) {
      logger.info({ processed }, 'Unfinished account deletions completed');
    }
  } catch (error) {
    logger.error({ err: error.message }, 'Account deletion recovery failed');
  }
};

/** SEC-138: send broadcasts whose scheduled time has come. Never rejects. */
const runScheduledNotifications = async () => {
  try {
    const { delivered } = await deliverDueNotifications();
    if (delivered > 0) logger.info({ delivered }, 'Scheduled notifications sent');
  } catch (error) {
    logger.error({ err: error.message }, 'Sending scheduled notifications failed');
  }
};

/** SEC-138: read Expo delivery receipts and drop tokens of uninstalled apps. Never rejects. */
const runPushReceiptCheck = async () => {
  const { removedTokens } = await checkPushReceipts();
  if (removedTokens > 0) logger.info({ removedTokens }, 'Removed push tokens of uninstalled apps');
};

async function startServer() {
  // SEC-021: Database connection is required in all environments.
  // Failure to connect is fatal - the server will not start without a valid DB.
  // This prevents silent failures where requests fail later with confusing errors.
  await connectToDatabase();
  logger.info('Database connected successfully');

  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    logger.info({ port: env.port }, 'Kredibble API listening');

    if (!env.isTest) {
      runDeletionRecovery();
      setInterval(runDeletionRecovery, DELETION_RECOVERY_INTERVAL_MS).unref();
      setInterval(runScheduledNotifications, SCHEDULED_NOTIFICATION_INTERVAL_MS).unref();
      setInterval(runPushReceiptCheck, PUSH_RECEIPT_INTERVAL_MS).unref();
    }
  });
}

startServer();
