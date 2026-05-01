# FAQ

## Is SST free?

Yes. SST is licensed under the MIT License. See [License](../Legal/License.md).

## Do I need both the API and the dashboard?

No.

- The **API** is required for the dashboard and for most automation.
- The **dashboard** is optional; you can use the API directly.

## Where does SST store files?

SST uses the DayZ server `$profile` folder (typically under `profiles/`) and writes SST-specific JSON under `$profile:SST/`.

See [In-Game Integration](../In-Game%20Integration/Mod%20Overview.md).

## How do I add a new exporter feature?

Start from the template and follow the established JSON patterns:

- [SST_ApiFeatureTemplate](../SST%20Mod%20Files/SST_ApiFeatureTemplate.md)

## How do I secure the API?

- Use strong secrets (JWT secret, API key).
- Restrict API exposure (bind to LAN/VPN, firewall).
- Use least-privilege accounts for admin actions.

See [Authentication](../API/Authentication.md).
