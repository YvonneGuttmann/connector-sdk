module.exports = {
    schemaId: "{org}/approval/{system}/expense/generic/1.0",
    public: {
        name: "{{name:string}}",
        requester: "{{requester:string}}",
        requestDate: "{{requestDate:date}}",
        location: "{{location:string}}",
        costCenter: "{{costCenter:string}}",
        items: {
            $fetch: "{{receipts:array}}",
            $map: {
                name: "{{this.name}}",
                amount: {
                    value: "{{this.amount.value:number}}",
                    currency: "{{this.amount.currency:string}}"
                },
                date: "{{this.date:date}}",
                category: "{{this.category:string}}"
            }
        },
        history: {
            $fetch: "{{history:array}}",
            $map: {
                from: "{{this.user}}",
                status: "{{this.status}}",
                date: "{{this.date:?date}}",
                isOpen: {
                    $fetch: "{{this.status}}",
                    $translate: [
                        {
                            from: "Pending",
                            to: true
                        },
                        {
                            default: false
                        }
                    ]
                },
                isSelf: {
                    $translate: [
                        {
                            from: {
                                "this.userId": {
                                    $eq: "{{approverId}}"
                                }
                            },
                            to: true
                        },
                        {
                            default: false
                        }
                    ]
                }
            }
        }
    },
    private: {
        id: "{{id}}",
        approver: "{{approverId}}"
    }
};