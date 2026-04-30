import { Unit } from "@oipage/testjs"

let { describe, it, expect } = Unit.node()

describe("测试加法运算", () => {

    it("1+1=2", () => {
        expect(1 + 1).toBe(2)
    })
})