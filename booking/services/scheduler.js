const cron = require('node-cron');
const db = require('../db/database');
const email = require('./emailService');

function log(msg) {
  console.log(`[Scheduler ${new Date().toISOString()}] ${msg}`);
}

async function runReminders() {
  // 24h reminder
  const upcoming24h = db.getPending24h.all();
  for (const booking of upcoming24h) {
    try {
      await email.send24hReminder(booking);
      db.markEmailSent('email_24h_sent', booking.id);
      log(`24h reminder poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
    } catch (err) {
      log(`GREŠKA 24h reminder booking #${booking.id}: ${err.message}`);
    }
  }

  // 1h reminder
  const upcoming1h = db.getPending1h.all();
  for (const booking of upcoming1h) {
    try {
      await email.send1hReminder(booking);
      db.markEmailSent('email_1h_sent', booking.id);
      log(`1h reminder poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
    } catch (err) {
      log(`GREŠKA 1h reminder booking #${booking.id}: ${err.message}`);
    }
  }

  // Review request (termin je prošao 30+ minuta)
  const pastBookings = db.getPendingReview.all();
  for (const booking of pastBookings) {
    try {
      await email.sendReviewRequest(booking);
      db.completeBooking.run(booking.id);
      log(`Review request poslan za booking #${booking.id} (${booking.ime} ${booking.prezime})`);
    } catch (err) {
      log(`GREŠKA review request booking #${booking.id}: ${err.message}`);
    }
  }
}

function startScheduler() {
  // Svake 5 minuta
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
