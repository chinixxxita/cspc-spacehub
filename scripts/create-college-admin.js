// Legacy CLI provisioning is disabled so all College Administrator account
// creation and management goes through the authenticated System Administrator UI.
console.error("This command is disabled. Sign in as the System Administrator and use /system-admin to create or manage College Administrators.");
process.exitCode = 1;
