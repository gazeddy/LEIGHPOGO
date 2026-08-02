import { useState } from "react"
import { TRADE_FRIENDSHIP_REQUIREMENTS } from "../lib/tradeUtils"

const emptyItem = () => ({
  pokemonName: "",
  shiny: false,
  lucky: false,
  xxl: false,
  xxs: false,
  costume: false,
  background: false,
  dynamax: false,
  gigantamax: false,
  notes: "",
})

const itemSize = (item) => {
  if (item.xxl) return "XXL"
  if (item.xxs) return "XXS"
  return "ANY"
}

function TradeItemsEditor({ title, items, onChange }) {
  const updateItem = (index, patch) => {
    onChange(items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )))
  }

  const updateItemSize = (index, size) => {
    updateItem(index, {
      xxl: size === "XXL",
      xxs: size === "XXS",
    })
  }

  const removeItem = (index) => {
    if (items.length === 1) return
    onChange(items.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <section className="trade-form-section">
      <div className="trade-section-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onChange([...items, emptyItem()])}
        >
          Add Pokémon
        </button>
      </div>

      <div className="trade-item-editor-list">
        {items.map((item, index) => (
          <div className="trade-item-editor" key={index}>
            <div className="trade-section-header">
              <strong>Pokémon {index + 1}</strong>
              {items.length > 1 && (
                <button
                  type="button"
                  className="danger compact-button"
                  onClick={() => removeItem(index)}
                >
                  Remove
                </button>
              )}
            </div>

            <label>
              Pokémon name
              <input
                type="text"
                value={item.pokemonName}
                onChange={(event) => updateItem(index, { pokemonName: event.target.value })}
                maxLength={100}
                required
              />
            </label>

            <fieldset className="trade-size-fieldset">
              <legend>Size</legend>
              <div className="trade-flags">
                {[
                  ["ANY", "Any size"],
                  ["XXL", "XXL"],
                  ["XXS", "XXS"],
                ].map(([value, label]) => (
                  <label className="checkbox" key={value}>
                    <input
                      type="radio"
                      name={`${title}-${index}-size`}
                      value={value}
                      checked={itemSize(item) === value}
                      onChange={() => updateItemSize(index, value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="trade-flags">
              {[
                ["shiny", "Shiny"],
                ["lucky", "Lucky"],
                ["costume", "Costume"],
                ["background", "Special background"],
                ["dynamax", "Dynamax"],
                ["gigantamax", "Gigantamax"],
              ].map(([key, label]) => (
                <label className="checkbox" key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(item[key])}
                    onChange={(event) => updateItem(index, { [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>

            <label>
              Item notes
              <input
                type="text"
                value={item.notes || ""}
                onChange={(event) => updateItem(index, { notes: event.target.value })}
                maxLength={250}
                placeholder="Form, level, legacy move, or anything else useful"
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function TradeListingForm({
  initialValue,
  onSubmit,
  submitLabel = "Save listing",
  isSubmitting = false,
}) {
  const [friendshipRequirement, setFriendshipRequirement] = useState(
    initialValue?.friendshipRequirement || "ANY",
  )
  const [location, setLocation] = useState(initialValue?.location || "")
  const [notes, setNotes] = useState(initialValue?.notes || "")
  const [offeredItems, setOfferedItems] = useState(
    initialValue?.offeredItems?.length ? initialValue.offeredItems : [emptyItem()]
  )
  const [wantedItems, setWantedItems] = useState(
    initialValue?.wantedItems?.length ? initialValue.wantedItems : [emptyItem()]
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit({
      friendshipRequirement,
      location,
      notes,
      offeredItems,
      wantedItems,
    })
  }

  return (
    <form className="trade-listing-form" onSubmit={handleSubmit}>
      <TradeItemsEditor
        title="Pokémon offered"
        items={offeredItems}
        onChange={setOfferedItems}
      />

      <TradeItemsEditor
        title="Pokémon wanted"
        items={wantedItems}
        onChange={setWantedItems}
      />

      <section className="trade-form-section">
        <h2>Trade details</h2>
        <div className="stack trade-details-fields">
          <label>
            Friendship requirement
            <select
              value={friendshipRequirement}
              onChange={(event) => setFriendshipRequirement(event.target.value)}
            >
              {TRADE_FRIENDSHIP_REQUIREMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Choose the minimum friendship level you are willing to trade at, or restrict
            the listing to Lucky Friends only.
          </p>

          <label>
            General location
            <input
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={120}
              placeholder="For example: Leigh town centre"
            />
          </label>

          <label>
            Listing notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              rows={5}
              placeholder="Availability, special-trade requirements, or other details"
            />
          </label>
        </div>
      </section>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  )
}
