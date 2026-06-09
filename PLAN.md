# PLAN

## Task 1: Create the app skeleton (DONE)

* Minimal app skeleton

## Task 2: Design Mockups (DONE)

* Design ascii mockups for the page and zero state

## Task 3: Layer abstraction and dummy data (DONE)

* Design an interface for Layer, design a response schema
    - run_query(query)
* Create dummy data and implement Layer0 in layers/layer0_dummy_data.py
* Add a config.py that specifies the current layer
* A utility to create the layer. 
* Wire it to the app

**ACCEPTANCE CRITERIA**
- The search and filters should work


## Task 4: Layer 1: Add search interface

* Add sample phones data in data/ with each phone as a JSON document
* Added schema.sql to sqlite. Use FTS5. 
* Add a script to import the data into a database
* Add layer1 - search

## BACKLOG

None