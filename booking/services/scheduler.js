const cron = require('node-cron');
const db = require('../db/database');
const email = require('./emailService');

function log(msg) {
  console.log(`[Scheduler ${new Date().toISOString()}] ${msg}`);
}

async function runReminders() {
  // 24h reminder
  const upcoming24h = await db.getPending24h();
  for (const booking of upcoming24h) {
    try {
      await email.send24hReminder(booking);
      await db.markEmailSent('email_24h_sent', booking.id);
      log(`24h reminder poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
    } catch (err) {
      log(`GREŠKA 24h reminder booking #${booking.id}: ${err.message}`);
    }
  }

  // 1h reminder
  const upcoming1h = await db.getPending1h();
  for (const booking of upcoming1h) {
    try {
      await email.send1hReminder(booking);
      await db.markEmailSent('email_1h_sent', booking.id);
      log(`1h reminder poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
    } catch (err) {
      log(`GREŠKA 1h reminder booking #${booking.id}: ${err.message}`);
    }
  }

  // Review request (termin je prošao 30+ minuta, samo prvi posjet)
  const pastBookings = await db.getPendingReview();
  for (const booking of pastBookings) {
    try {
      const firstVisit = await db.isFirstVisit(booking.client_id);
      if (firstVisit && booking.email) {
        await email.sendReviewRequest(booking);
        log(`Review request poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
      }
      await db.markEmailSent('email_review_sent', booking.id);
    } catch (err) {
      log(`GREŠKA review request booking #${booking.id}: ${err.message}`);
    }
  }
}

function startScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runReminders();
    } catch (err) {
      log(`GREŠKA u scheduler runu: ${err.message}`);
    }
  });
  log('Scheduler pokrenut — provjera svakih 5 minuta.');
}

module.exports = { startScheduler };
