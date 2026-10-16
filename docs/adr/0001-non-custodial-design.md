# ADR 0001 — Non-custodial design

## Status

Accepted

## Context

A delegate such as Andrea needs to cause a payment for a restricted purpose. Moving the budget into COMPAS, or into the delegate's wallet, would make COMPAS or the delegate a holder of unrestricted or stored value.

## Decision

COMPAS stores and evaluates permission. The payer's wallet keeps the funds until Open Payments pays the merchant. `remainingAuthorizedAmount` is authorization capacity. The delegate is not the payee.

COMPAS does not issue a token and does not require a blockchain.

## Consequences

The product cannot show a delegate balance that looks like received money. A later Open Payments grant may limit the debit amount. That limit is still not custody by COMPAS. Refunds must eventually restore capacity as well as value, and that flow is not designed yet.
