# Relic Valuation

## Source Data

Relic reward tables are imported from WFCD `warframe-drop-data`:

```text
https://drops.warframestat.us/data/relics.json
```

WFCD generates this structured data from Digital Extremes' official public drop tables. This project uses the structured JSON instead of scraping the official HTML table directly.

The importer stores the source name and source update timestamp on each relic row.

## Scope

The Relics module calculates expected trade value when opening an already-owned relic:

```text
relic -> reward probability -> reward platinum value
```

It does not model:

- mission chance to acquire the relic;
- 4-player Radshare or Intshare;
- choosing one reward from multiple opened relics;
- Ducat value;
- utility value for non-tradable rewards.

## Database Shape

```text
relics
  id
  name
  era
  code
  status
  probability_model
  probability_model_reason
  source
  source_id
  source_updated_at
  is_supported

relic_rewards
  relic_id
  reward_name
  market_url_name
  item_name
  rarity
  source_rarity
  match_status
  is_tradable
  chance_intact
  chance_exceptional
  chance_flawless
  chance_radiant
```

Probabilities are stored per reward/refinement instead of being hard-coded from table position. This allows custom or special relic distributions to be represented later.

## Standard Probability Model

For standard six-reward relics:

| Rarity | Intact | Exceptional | Flawless | Radiant |
|---|---:|---:|---:|---:|
| Common, each | 25.33% | 23.33% | 20% | 16.67% |
| Uncommon, each | 11% | 13% | 17% | 20% |
| Rare | 2% | 4% | 6% | 10% |

Rounding tolerance is allowed because `3 * 25.33 + 2 * 11 + 2 = 99.99`.

## Reward Mapping

Reward names are normalized and matched deterministically against the local Warframe.market item catalog. The importer records:

- `matched`
- `unmatched`
- `ambiguous`
- `non_tradable`

Unmatched rewards are never silently assigned to a market item. Forma Blueprint is treated as non-tradable for trade EV and contributes `0p`.

## Reward Value

Relic EV uses the central market semantic selector:

```js
getMarketValue(valuation, "resale")
```

Fallback order:

```text
competitiveEstimate
historical median
legacy average
unavailable
```

The source used for each reward is exposed in the API and UI.

## EV Formula

```text
EV(refinement) = sum(P(reward | refinement) * trade value(reward))
```

Each reward also exposes its contribution:

```text
chance * value = EV contribution
```

## Void Trace Efficiency

Refinement costs:

| Refinement | Traces |
|---|---:|
| Intact | 0 |
| Exceptional | 25 |
| Flawless | 50 |
| Radiant | 100 |

Efficiency:

```text
(EV(refinement) - EV(Intact)) / trace cost
```

This is expected platinum value per Void Trace, not a direct platinum value for traces.

## Confidence

Relic-level confidence is derived from reward value coverage:

- number of tradable rewards with values;
- unavailable rare reward prices;
- legacy fallback usage;
- current competitive valuation availability.

Confidence is explainable and does not imply guaranteed profit.

## Known Limitations

- Vaulted/current status is currently stored as `unknown` because the selected structured source does not provide a reliable status field.
- Special/custom relic probability models are preserved from source chances, but no special strategy UI is added yet.
- Squad EV and Radshare are explicitly future work.
